# Model Pipeline — Agent Guide

This document is for AI coding agents (Cursor, Copilot, Claude Code, etc.) working on the model validation pipeline. Read this before making changes.

## Quick Reference

```bash
cd model-pipeline

# Validate a single model
node validate-model.mjs ../public/models/burger.glb

# Validate + auto-fix → writes burger.fixed.glb
node validate-model.mjs ../public/models/burger.glb --fix

# Validate + auto-fix → overwrite original
node validate-model.mjs ../public/models/burger.glb --fix --out ../public/models/burger.glb

# Validate all models in public/models/
node validate-all.mjs

# Fix all models and overwrite originals
node validate-all.mjs --fix --replace

# Exit codes: 0=PASS, 1=FAIL, 2=FIXED
```

## What This Pipeline Does

Validates and auto-fixes GLB (glTF Binary) 3D models of food dishes so they render correctly in AR on both iOS and Android. The pipeline is a safety net between Blender export and production deployment.

**The AR viewer code is in `../src/components/ARViewer.jsx`.** It uses Google's `@google/model-viewer` web component. The viewer handles runtime scaling (models don't need to be pre-scaled). The pipeline's job is to ensure the GLB file is structurally compatible with all AR rendering paths.

## Why This Exists — The 3 Bugs That Created It

1. **Draco compression** (`KHR_draco_mesh_compression`) — model-viewer's 3D preview decodes Draco fine, but iOS Quick Look's USDZ converter and older Android Scene Viewer drop Draco-compressed meshes. Food disappears, only the plate shows.

2. **Unlit shadow planes** (`KHR_materials_unlit` + `alphaMode: BLEND`) — Fake shadow quads (4-vertex meshes) render as opaque white rectangles in some AR viewers, occluding the food.

3. **Oversized files** — 25-30MB models with uncompressed PNG textures timeout on mobile networks and crash low-end phones.

## File Structure

```
model-pipeline/
├── validate-model.mjs      # CLI entry point — orchestrates check → fix → write
├── validate-all.mjs         # Batch runner — runs validate-model on a directory of GLBs
├── package.json             # Dependencies: @gltf-transform/*, sharp
├── agents.md                # This file
└── lib/
    ├── config.mjs           # All tunable thresholds (file size, triangle limits, etc.)
    ├── output.mjs           # Terminal colors, severity levels, ValidationResult class
    ├── helpers.mjs          # Geometry utils: countTriangles, getBoundingBox, isShadowPlane
    ├── checks.mjs           # 6 check functions — each inspects one aspect of the model
    ├── fixes.mjs            # 6 fix functions — each repairs one specific problem
    └── io.mjs               # glTF I/O setup with extension registration
```

## Architecture

```
validate-model.mjs (orchestrator)
    │
    ├── reads GLB file via io.mjs (createIO)
    │
    ├── runs checks in order (checks.mjs):
    │   1. checkFileSize     — total bytes < 20MB
    │   2. checkMeshes       — has vertices, triangles < 100K
    │   3. checkExtensions   — no Draco, no required extensions
    │   4. checkTextures     — all embedded, dimensions ≤ 4096
    │   5. checkMaterials    — metallic < 0.5, detects shadow planes
    │   6. checkBoundingBox  — world-space scale 0.05-0.6m, Y-min ≈ 0
    │
    ├── if --fix flag: runs fixes in order (fixes.mjs):
    │   1. fixDraco           — dispose Draco extension (auto-decoded on read)
    │   2. fixUnlitMaterials  — strip unlit, set roughness=1 metalness=0
    │   3. fixShadowPlanes    — detach tiny BLEND meshes from nodes
    │   4. fixOversizedTex    — resize textures > 4096
    │   5. fixLargeTextures   — PNG→JPEG + resize when file > 20MB
    │   6. fixDedup           — deduplicate textures, prune orphaned resources
    │
    ├── writes fixed GLB + re-validates output
    │
    └── prints report + exits with code (0=PASS, 1=FAIL, 2=FIXED)
```

## Data Flow

Every check function signature: `check*(result, docOrData) → { flags }`
- `result` is a `ValidationResult` instance — call `result.add(severity, check, message)` to log
- Returns an object with boolean flags (e.g. `{ hasDraco, hasUnlit }`) consumed by the fix layer

Every fix function signature: `fix*(doc, result, ...extras) → void`
- Mutates the gltf-transform `Document` in place
- Logs what it changed via `result.addFix(check, message)`
- Must be idempotent — running on an already-clean model = no-op

`ValidationResult` collects all checks and fixes, then `print()` formats them for terminal.

## Key Dependencies

- **@gltf-transform/core** — read/write/manipulate glTF documents programmatically
- **@gltf-transform/extensions** — decode Draco, read material extensions
- **@gltf-transform/functions** — `dedup()`, `prune()` transforms
- **sharp** — resize/compress textures (PNG→JPEG conversion)

gltf-transform auto-decodes Draco on `io.read()` if `KHRDracoMeshCompression` is registered (done in `io.mjs`). The mesh data in the Document is always uncompressed — `fixDraco` just disposes the extension metadata so it's not written back.

## Debugging Common Issues

### "Model shows plate but no food in AR"
The food mesh is missing from the AR render. Check:
1. Does the model have `KHR_draco_mesh_compression`? → `fixDraco`
2. Does it have shadow planes with BLEND alpha? → `fixShadowPlanes`
3. Does it have `KHR_materials_unlit`? → `fixUnlitMaterials`
Run `node validate-model.mjs model.glb` — it will flag the exact cause.

### "Validation says wrong scale (4m, 15m) but model looks fine in viewer"
The bounding box calculation in `helpers.mjs:getBoundingBox` walks the node hierarchy and applies parent transforms. If the value is wildly off, the shadow plane meshes are likely extending the bounding box (they can be positioned far from the food). After `--fix` removes shadow planes, the bounding box normalizes. **This is not a bug** — the runtime ARViewer.jsx compensates with its own scaling.

### "RESULT: FAIL but --fix produced a working file"
Expected behavior. The RESULT reflects the input file's status. The fix output is a separate file. Re-run the validator on the output file to confirm it passes:
```bash
node validate-model.mjs model.glb --fix --out fixed.glb
node validate-model.mjs fixed.glb  # should show PASS
```

### "fixUnlitMaterials runs but no log message appears"
The unlit extension may only be on shadow plane materials. When `fixShadowPlanes` removes those meshes and `fixDedup/prune` removes the orphaned materials, the unlit extension gets cleaned up indirectly. The fix still works — verify by checking the output file's extensions.

### "Texture compression changed visual quality"
`fixLargeTextures` converts PNG→JPEG at quality 90 and resizes to 2048px. This is lossy. If a specific model's food texture looks degraded, re-export from Blender with JPEG textures at 2048x2048 instead of relying on the auto-fix.

## Extending the Pipeline

### Adding a new check
1. Write a function in `lib/checks.mjs` following the pattern: `checkX(result, doc) → { flags }`
2. Call it in `validate-model.mjs:validate()` after existing checks
3. If it returns flags that need auto-fixing, pass them through to `applyFixes()`

### Adding a new fix
1. Write a function in `lib/fixes.mjs` following the pattern: `fixX(doc, result) → void`
2. Call it in `validate-model.mjs:applyFixes()` — order matters:
   - Decode/structural fixes first (Draco, extensions)
   - Material/mesh fixes second (unlit, shadow planes)
   - Texture fixes third (resize, compress)
   - `fixDedup` always last (cleans up after all other fixes)

### Changing thresholds
All limits are in `lib/config.mjs` with comments explaining why each value was chosen. Change there, not in check functions.

## Do NOT Change These Things

These are deliberate design decisions, not oversights. An AI agent unfamiliar with the history will be tempted to "fix" them.

1. **Scale and Y-offset checks are WARN, not CRITICAL.** Do not promote them. ARViewer.jsx compensates at runtime. Making these CRITICAL would reject models that render perfectly fine.

2. **Shadow plane removal is correct.** model-viewer adds its own shadow (`shadow-intensity="1"` in ARViewer.jsx). iOS Quick Look and Android Scene Viewer also add native AR shadows. The baked-in shadow planes from 3D scans are redundant and cause rendering bugs. Do not add them back.

3. **Fix order in `applyFixes()` must stay as-is.** Draco decode must happen before anything reads geometry. Shadow plane removal must happen before dedup/prune (so orphaned materials get cleaned up). Dedup must always be last. Reordering will cause silent data loss.

4. **`fixLargeTextures` converts PNG→JPEG.** This is intentionally lossy. Food photo-textures from 3D scans are photographic content — JPEG at quality 90 is visually identical and 10-20x smaller. Do not change this to lossless PNG-to-PNG resize, it won't solve the file size problem.

5. **The pipeline is separate from the main app (`model-pipeline/` has its own `package.json`).** Do not merge dependencies into the root `package.json`. The pipeline runs offline during model preparation, not at runtime. Keeping it separate means `sharp` and `@gltf-transform/*` never end up in the production frontend bundle.

## Known Limitations (not bugs, just scope boundaries)

- `getBoundingBox` in helpers.mjs uses simplified TRS (no quaternion rotation). This is fine for food models which are always axis-aligned after Blender export. If rotated models are ever added, this function would need full matrix multiplication.
- `isShadowPlane` detection uses a vertex count threshold (≤8). A decorative mesh that happens to have 4 vertices and BLEND alpha would be incorrectly removed. In practice, all food models have food meshes with thousands of vertices, so this threshold works.
- Batch validation (`validate-all.mjs`) runs models sequentially, not in parallel. For 10-20 models this is fine (takes ~30 seconds). At 100+ models, consider parallelizing.

## What This Pipeline Does NOT Do

- **Runtime scaling** — ARViewer.jsx handles this. The pipeline doesn't need to rescale models.
- **Y-offset correction** — model-viewer's `ar-placement="floor"` handles this. Floor alignment warnings are for the Blender artist, not the pipeline.
- **USDZ conversion** — model-viewer does this at runtime for iOS. If checks 1-5 pass, USDZ conversion will work.
- **Mesh decimation** — requires artistic judgment. The pipeline flags high triangle counts but only a human (or Blender script) can decimate properly.
- **Color/lighting correction** — subjective. The pipeline ensures materials are PBR-compatible, but "does the food look appetizing" is a human call.

## Relationship to ARViewer.jsx

The viewer expects a GLB file that:
1. `model-viewer` can load → requires valid glTF 2.0 (CHECK 1-2)
2. `model-viewer` can export to USDZ for iOS → requires no Draco, no unlit, embedded textures (CHECK 3-4)
3. Won't crash the phone → requires reasonable file size and texture dimensions (CHECK 1, 4)

The viewer's runtime scaling (`getDimensions()` → calculate scale → `viewer.scale`) compensates for models at any scale. The viewer's `ar-scale="fixed"` preserves this calculated scale in AR mode. The pipeline's scale/floor warnings are advisory for Blender artists, not blockers for the viewer.
