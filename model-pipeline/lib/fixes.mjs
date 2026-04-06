/**
 * Auto-fix functions — each fixes one specific problem detected by checks.
 *
 * Fix functions mutate the gltf-transform Document in place and log
 * what they changed via result.addFix(). They should be idempotent —
 * running a fix on an already-clean model should be a no-op.
 *
 * Fix order matters:
 *   1. fixDraco         — decode compressed meshes (must happen before other fixes can read geometry)
 *   2. fixUnlitMaterials — convert unlit → PBR
 *   3. fixShadowPlanes  — remove shadow quads (must happen before dedup/prune)
 *   4. fixOversizedTex   — resize textures > 4096
 *   5. fixLargeTextures  — compress when total file > budget
 *   6. fixDedup          — deduplicate + prune unused resources (always last)
 */
import { dedup, prune } from "@gltf-transform/functions";
import sharp from "sharp";
import { CONFIG } from "./config.mjs";
import { isShadowPlane } from "./helpers.mjs";

/**
 * Remove Draco compression extension.
 * gltf-transform's NodeIO already decodes Draco on read, so we just
 * need to dispose the extension so it's not written back out.
 */
export async function fixDraco(doc, result) {
  const dracoExt = doc.getRoot().listExtensionsUsed()
    .find((e) => e.extensionName === "KHR_draco_mesh_compression");

  if (dracoExt) {
    dracoExt.dispose();
    result.addFix("Draco compression", "Decoded and removed KHR_draco_mesh_compression");
  }
}

/**
 * Strip KHR_materials_unlit from all materials and convert to PBR.
 * Sets roughness=1.0, metalness=0.0 which looks similar to unlit
 * but works correctly in AR lighting environments.
 */
export function fixUnlitMaterials(doc, result) {
  let count = 0;
  for (const mat of doc.getRoot().listMaterials()) {
    const unlit = mat.getExtension("KHR_materials_unlit");
    if (unlit) {
      mat.setExtension("KHR_materials_unlit", null);
      mat.setRoughnessFactor(Math.max(mat.getRoughnessFactor(), 0.8));
      mat.setMetallicFactor(0.0);
      count++;
    }
  }

  const unlitExt = doc.getRoot().listExtensionsUsed()
    .find((e) => e.extensionName === "KHR_materials_unlit");
  if (unlitExt) unlitExt.dispose();

  if (count > 0) {
    result.addFix(
      "Unlit materials",
      `Converted ${count} material(s) from unlit to PBR (roughness=1.0, metalness=0.0)`
    );
  }
}

/**
 * Remove shadow plane meshes from the scene graph.
 * Detaches the mesh from its node — the mesh itself gets cleaned up by prune().
 */
export function fixShadowPlanes(doc, result) {
  let removed = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh && isShadowPlane(mesh)) {
      node.setMesh(null);
      removed++;
    }
  }

  if (removed > 0) {
    result.addFix("Shadow planes", `Removed ${removed} shadow plane mesh(es)`);
  }
}

/**
 * Resize textures that exceed the max dimension (4096).
 * Preserves format (PNG stays PNG, JPEG stays JPEG).
 */
export async function fixOversizedTextures(doc, result, oversizedList) {
  let fixed = 0;
  for (const { texture, name, width, height } of oversizedList) {
    const image = texture.getImage();
    if (!image) continue;

    try {
      const targetSize = CONFIG.maxTextureDimension;
      const resized = await sharp(Buffer.from(image))
        .resize(targetSize, targetSize, { fit: "inside", withoutEnlargement: true })
        .toFormat(texture.getMimeType() === "image/jpeg" ? "jpeg" : "png")
        .toBuffer();

      texture.setImage(new Uint8Array(resized));
      const newSize = await sharp(Buffer.from(resized)).metadata();
      result.addFix(
        `Texture "${name}"`,
        `Resized from ${width}x${height} to ${newSize.width}x${newSize.height}`
      );
      fixed++;
    } catch (e) {
      result.add?.("WARN", `Texture "${name}"`, `Could not auto-resize: ${e.message}`);
    }
  }
  return fixed;
}

/**
 * Aggressively compress textures when total file size exceeds budget.
 * Strategy: convert large PNGs to JPEG (biggest savings), resize 4096→2048.
 * Processes textures largest-first for maximum impact.
 */
export async function fixLargeTextures(doc, result) {
  const textures = doc.getRoot().listTextures();
  let totalReduced = 0;

  const withSize = textures
    .map((t) => ({ tex: t, size: t.getImage()?.byteLength || 0, name: t.getName() || "(unnamed)" }))
    .sort((a, b) => b.size - a.size);

  for (const { tex, size, name } of withSize) {
    if (size < 500_000) continue;

    const image = tex.getImage();
    if (!image) continue;

    try {
      const meta = await sharp(Buffer.from(image)).metadata();
      const isPng = tex.getMimeType() === "image/png" || meta.format === "png";

      if (isPng && size > 1_000_000) {
        const targetDim = meta.width > 2048 ? 2048 : meta.width;
        const compressed = await sharp(Buffer.from(image))
          .resize(targetDim, targetDim, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();

        tex.setImage(new Uint8Array(compressed));
        tex.setMimeType("image/jpeg");
        const saved = size - compressed.byteLength;
        totalReduced += saved;
        result.addFix(
          `Texture "${name}"`,
          `PNG→JPEG + resize to ${targetDim}px (${(size / 1024 / 1024).toFixed(1)}MB → ${(compressed.byteLength / 1024 / 1024).toFixed(1)}MB)`
        );
        continue;
      }

      if (meta.width > 2048 || meta.height > 2048) {
        const compressed = await sharp(Buffer.from(image))
          .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
          .toBuffer();

        tex.setImage(new Uint8Array(compressed));
        const saved = size - compressed.byteLength;
        totalReduced += saved;
        result.addFix(
          `Texture "${name}"`,
          `Resized to 2048px (${(size / 1024).toFixed(0)}KB → ${(compressed.byteLength / 1024).toFixed(0)}KB)`
        );
      }
    } catch (e) {
      result.add?.("WARN", `Texture "${name}"`, `Could not compress: ${e.message}`);
    }
  }

  if (totalReduced > 0) {
    result.addFix(
      "Compression",
      `Total reduction: ${(totalReduced / 1024 / 1024).toFixed(1)}MB`
    );
  }
}

/**
 * Deduplicate shared resources and prune unused ones.
 * Always run this last — it cleans up orphaned meshes/materials/textures
 * left behind by other fixes (e.g. shadow plane removal).
 */
export async function fixDedup(doc, result) {
  await doc.transform(dedup(), prune());
  result.addFix("Optimization", "Deduplicated textures and pruned unused resources");
}
