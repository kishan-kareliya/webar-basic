/**
 * Validation thresholds and limits.
 *
 * These values are tuned for food-on-plate AR models viewed on mobile phones.
 * Change with caution — each value exists to prevent a specific production failure.
 * See agents.md for the reasoning behind each limit.
 */
export const CONFIG = {
  // ─── File size ───
  // 20MB = loads in ~3s on 4G. Models above this choke low-end phones.
  maxFileSizeMB: 20,

  // ─── Textures ───
  // 4096 = max safe GPU texture size across all AR-capable phones (2019+).
  // 8192 crashes Samsung A-series and older iPhones.
  maxTextureDimension: 4096,

  // ─── Geometry ───
  // 100K tris = smooth 60fps on mid-range phones. Beyond this, Scene Viewer stutters.
  maxTriangles: 100_000,
  // 80K = "you're getting close" warning so the artist can decimate proactively.
  warnTriangles: 80_000,
  // Mesh/material limits — models with 20+ meshes or 10+ materials are a sign of
  // un-cleaned scans (every leaf, every table edge is a separate object).
  maxMeshes: 20,
  maxMaterials: 10,

  // ─── Bounding box (meters) ───
  // Real food plates range from 0.10m (small momo plate) to 0.45m (large thali).
  // 0.05-0.6 gives comfortable headroom.
  minBboxDim: 0.05,
  maxBboxDim: 0.6,

  // ─── Shadow plane detection ───
  // Shadow planes are flat quads (4 vertices) with BLEND alpha material.
  // They create fake shadows that break in AR. Any mesh with ≤ this many
  // vertices AND a BLEND material is treated as a shadow plane.
  shadowPlaneMaxVertices: 8,
};
