/**
 * Validation checks — each function inspects one aspect of a GLB model.
 *
 * Every check function takes (result, doc_or_data) and adds PASS/WARN/CRITICAL
 * entries to the result. Returns an object with flags that the auto-fix layer uses
 * to decide what to fix.
 *
 * Check order matters: file size → geometry → extensions → textures → materials → bbox.
 * This order is designed so cheap/fast checks run first, and if a model is completely
 * broken (empty, corrupt), we fail early before doing expensive texture analysis.
 */
import { CONFIG } from "./config.mjs";
import { CRITICAL, WARN, INFO, PASS } from "./output.mjs";
import { countTriangles, getBoundingBox, isShadowPlane } from "./helpers.mjs";

// ─── CHECK 1: File size ────────────────────────────────────────
export function checkFileSize(result, fileBytes) {
  const sizeMB = fileBytes / (1024 * 1024);
  result.stats["File size"] = `${sizeMB.toFixed(2)} MB`;

  if (sizeMB > CONFIG.maxFileSizeMB) {
    result.add(
      CRITICAL,
      "File size",
      `${sizeMB.toFixed(1)}MB exceeds ${CONFIG.maxFileSizeMB}MB limit. Reduce texture resolution or polygon count.`
    );
    return false;
  }
  result.add(PASS, `File size: ${sizeMB.toFixed(2)} MB`);
  return true;
}

// ─── CHECK 2: Geometry — meshes, vertices, triangle count ──────
export function checkMeshes(result, doc) {
  const meshes = doc.getRoot().listMeshes();
  let totalTris = 0;
  let hasVertices = false;

  for (const mesh of meshes) {
    const tris = countTriangles(mesh);
    totalTris += tris;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (pos && pos.getCount() > 0) hasVertices = true;
    }
  }

  result.stats["Meshes"] = meshes.length;
  result.stats["Triangles"] = totalTris.toLocaleString();

  if (meshes.length === 0 || !hasVertices) {
    result.add(CRITICAL, "Geometry", "No meshes or no vertices found. File is empty.");
    return false;
  }

  if (meshes.length > CONFIG.maxMeshes) {
    result.add(
      WARN,
      "Mesh count",
      `${meshes.length} meshes (limit ${CONFIG.maxMeshes}). Consider joining meshes in Blender.`
    );
  } else {
    result.add(PASS, `Geometry: ${meshes.length} meshes, ${totalTris.toLocaleString()} triangles`);
  }

  if (totalTris > CONFIG.maxTriangles) {
    result.add(
      CRITICAL,
      "Triangle count",
      `${totalTris.toLocaleString()} triangles exceeds ${CONFIG.maxTriangles.toLocaleString()} limit. Decimate in Blender.`
    );
    return false;
  } else if (totalTris > CONFIG.warnTriangles) {
    result.add(
      WARN,
      "Triangle count",
      `${totalTris.toLocaleString()} approaching limit. Consider decimating for low-end phones.`
    );
  }

  return true;
}

// ─── CHECK 3: Extensions — Draco, unlit, required ──────────────
export function checkExtensions(result, doc) {
  const root = doc.getRoot();
  const required = root.listExtensionsRequired().map((e) => e.extensionName);
  const used = root.listExtensionsUsed().map((e) => e.extensionName);

  result.stats["Extensions used"] = used.length > 0 ? used.join(", ") : "none";
  result.stats["Extensions required"] = required.length > 0 ? required.join(", ") : "none";

  let hasDraco = false;
  let hasUnlit = false;
  let ok = true;

  if (required.length > 0) {
    result.add(
      CRITICAL,
      "Required extensions",
      `extensionsRequired: [${required.join(", ")}]. AR viewers that lack these will fail entirely.`
    );
    ok = false;
  } else {
    result.add(PASS, "No required extensions (universal AR compatibility)");
  }

  if (used.includes("KHR_draco_mesh_compression")) {
    hasDraco = true;
    result.add(
      CRITICAL,
      "Draco compression",
      "KHR_draco_mesh_compression found. iOS Quick Look USDZ converter and older Android Scene Viewer can drop meshes."
    );
    ok = false;
  } else {
    result.add(PASS, "No Draco compression");
  }

  if (used.includes("KHR_materials_unlit")) {
    hasUnlit = true;
    result.add(
      WARN,
      "Unlit materials",
      "KHR_materials_unlit found. These render as flat/dark in AR lighting. Recommend standard PBR."
    );
  }

  return { ok, hasDraco, hasUnlit };
}

// ─── CHECK 4: Textures — embedded, size, format ────────────────
export function checkTextures(result, doc) {
  const textures = doc.getRoot().listTextures();
  let ok = true;
  let hasExternal = false;
  let hasOversized = false;
  const oversizedList = [];

  result.stats["Textures"] = textures.length;

  if (textures.length === 0) {
    result.add(WARN, "Textures", "No textures found. Model may appear grey/untextured.");
    return { ok: true, hasExternal, hasOversized, oversizedList };
  }

  for (const tex of textures) {
    const uri = tex.getURI();
    const image = tex.getImage();
    const size = tex.getSize();
    const name = tex.getName() || "(unnamed)";

    if (uri && uri.startsWith("http")) {
      hasExternal = true;
      result.add(
        CRITICAL,
        `Texture "${name}"`,
        `External URI: ${uri}. Scene Viewer downloads only the GLB, not external files. Embed all textures.`
      );
      ok = false;
      continue;
    }

    if (!image) {
      result.add(WARN, `Texture "${name}"`, "No image data. Texture may be missing.");
      continue;
    }

    if (size) {
      const [w, h] = size;
      if (w > CONFIG.maxTextureDimension || h > CONFIG.maxTextureDimension) {
        hasOversized = true;
        oversizedList.push({ texture: tex, name, width: w, height: h });
        result.add(
          WARN,
          `Texture "${name}"`,
          `${w}x${h} exceeds ${CONFIG.maxTextureDimension}. Will cause GPU memory issues on low-end phones.`
        );
      }

      const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
      if (!isPow2(w) || !isPow2(h)) {
        result.add(
          INFO,
          `Texture "${name}"`,
          `${w}x${h} is not power-of-2. Some older GPUs may pad this, wasting memory.`
        );
      }
    }

    const mime = tex.getMimeType();
    if (mime && !["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      result.add(
        WARN,
        `Texture "${name}"`,
        `Format ${mime} may not be supported on all AR viewers. Use PNG or JPEG.`
      );
    }
  }

  if (!hasExternal && !hasOversized) {
    result.add(PASS, `All ${textures.length} textures embedded and within size limits`);
  } else if (!hasExternal) {
    result.add(PASS, `All ${textures.length} textures embedded`);
  }

  return { ok, hasExternal, hasOversized, oversizedList };
}

// ─── CHECK 5: Materials — PBR, metallic, shadow planes ─────────
export function checkMaterials(result, doc) {
  const materials = doc.getRoot().listMaterials();
  let hasShadowPlanes = false;
  let shadowPlaneCount = 0;

  result.stats["Materials"] = materials.length;

  if (materials.length > CONFIG.maxMaterials) {
    result.add(
      WARN,
      "Material count",
      `${materials.length} materials (limit ${CONFIG.maxMaterials}). Consider merging in Blender.`
    );
  }

  let highMetallic = false;
  for (const mat of materials) {
    const name = mat.getName() || "(unnamed)";
    const metallic = mat.getMetallicFactor();

    if (metallic > 0.5) {
      highMetallic = true;
      result.add(
        WARN,
        `Material "${name}"`,
        `Metallic factor ${metallic}. Food/plates should be 0.0-0.3. High metallic looks wrong in AR lighting.`
      );
    }
  }

  for (const mesh of doc.getRoot().listMeshes()) {
    if (isShadowPlane(mesh)) {
      hasShadowPlanes = true;
      shadowPlaneCount++;
    }
  }

  if (hasShadowPlanes) {
    result.add(
      WARN,
      "Shadow planes",
      `${shadowPlaneCount} shadow plane mesh(es) detected (tiny BLEND quads). AR creates its own shadows. These can occlude food in some AR viewers.`
    );
  }

  if (!highMetallic && !hasShadowPlanes && materials.length <= CONFIG.maxMaterials) {
    result.add(PASS, `Materials: ${materials.length} materials, all look correct`);
  }

  return { hasShadowPlanes };
}

// ─── CHECK 6: Bounding box — scale and floor alignment ─────────
export function checkBoundingBox(result, doc) {
  const bbox = getBoundingBox(doc);
  if (!bbox) {
    result.add(CRITICAL, "Bounding box", "Could not compute bounding box. Model may be empty.");
    return { ok: false, bbox: null };
  }

  const [sx, sy, sz] = bbox.size;
  const maxDim = Math.max(sx, sy, sz);
  const yMin = bbox.min[1];

  result.stats["Bounding box"] = `${sx.toFixed(3)} x ${sy.toFixed(3)} x ${sz.toFixed(3)} m`;
  result.stats["Y-min (floor)"] = `${yMin.toFixed(4)} m`;

  let ok = true;

  if (maxDim < CONFIG.minBboxDim) {
    result.add(
      WARN,
      "Scale",
      `Largest dimension ${maxDim.toFixed(3)}m (${(maxDim * 100).toFixed(1)}cm). Model seems too small. Check Blender scale.`
    );
  } else if (maxDim > CONFIG.maxBboxDim) {
    result.add(
      WARN,
      "Scale",
      `Largest dimension ${maxDim.toFixed(3)}m (${(maxDim * 100).toFixed(1)}cm). Model seems too large for a food plate. Check Blender scale.`
    );
  } else {
    result.add(
      PASS,
      `Scale: ${(maxDim * 100).toFixed(1)}cm largest dimension (realistic plate size)`
    );
  }

  if (Math.abs(yMin) > 0.02) {
    result.add(
      WARN,
      "Floor alignment",
      `Y-min is ${yMin.toFixed(4)}m. Plate bottom should be at Y≈0 for correct AR floor placement. Offset: ${(yMin * 100).toFixed(1)}cm.`
    );
  } else {
    result.add(PASS, "Floor alignment: plate bottom at Y≈0");
  }

  return { ok, bbox };
}
