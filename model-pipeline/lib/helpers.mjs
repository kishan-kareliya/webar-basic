/**
 * Geometry helpers — triangle counting, bounding box, shadow plane detection.
 *
 * These operate on gltf-transform Document objects.
 */
import { CONFIG } from "./config.mjs";

/**
 * Count triangles in a single mesh (across all its primitives).
 */
export function countTriangles(mesh) {
  let total = 0;
  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices();
    if (indices) {
      total += indices.getCount() / 3;
    } else {
      const pos = prim.getAttribute("POSITION");
      if (pos) total += pos.getCount() / 3;
    }
  }
  return total;
}

/**
 * Compute world-space bounding box by walking the scene graph
 * and accumulating scale/translation at each level.
 *
 * Uses a parent map for efficient tree traversal. Applies simplified
 * TRS (no quaternion rotation) — sufficient for food models which are
 * axis-aligned after Blender export.
 *
 * For large meshes (>10K vertices), samples every Nth vertex to keep
 * validation fast. The bounding box may be slightly underestimated but
 * within practical tolerance for scale/floor checks.
 */
export function getBoundingBox(doc) {
  const root = doc.getRoot();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  // Build a parent map: node → parent node
  const parentMap = new Map();
  for (const node of root.listNodes()) {
    for (const child of node.listChildren()) {
      parentMap.set(child, node);
    }
  }

  function getWorldTransform(node) {
    const chain = [];
    let current = node;
    while (current) {
      chain.unshift(current);
      current = parentMap.get(current) || null;
    }

    let sx = 1, sy = 1, sz = 1;
    let tx = 0, ty = 0, tz = 0;

    for (const n of chain) {
      const s = n.getScale();
      const t = n.getTranslation();
      tx = tx * s[0] + t[0];
      ty = ty * s[1] + t[1];
      tz = tz * s[2] + t[2];
      sx *= s[0];
      sy *= s[1];
      sz *= s[2];
    }

    return { sx, sy, sz, tx, ty, tz };
  }

  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;

    const { sx, sy, sz, tx, ty, tz } = getWorldTransform(node);

    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;

      const count = pos.getCount();
      const step = count > 10000 ? Math.floor(count / 5000) : 1;

      for (let i = 0; i < count; i += step) {
        const v = pos.getElement(i, [0, 0, 0]);
        const wx = v[0] * sx + tx;
        const wy = v[1] * sy + ty;
        const wz = v[2] * sz + tz;
        minX = Math.min(minX, wx);
        minY = Math.min(minY, wy);
        minZ = Math.min(minZ, wz);
        maxX = Math.max(maxX, wx);
        maxY = Math.max(maxY, wy);
        maxZ = Math.max(maxZ, wz);
      }
    }
  }

  if (minX === Infinity) return null;

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}

/**
 * Detect shadow plane meshes: tiny quads (≤8 vertices) with BLEND alpha.
 * These are fake shadow effects baked into the scan that break AR rendering.
 */
export function isShadowPlane(mesh) {
  let totalVertices = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    if (pos) totalVertices += pos.getCount();
  }
  if (totalVertices > CONFIG.shadowPlaneMaxVertices) return false;

  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    if (mat && mat.getAlphaMode() === "BLEND") return true;
  }
  return false;
}
