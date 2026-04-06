#!/usr/bin/env node

/**
 * GLB Model Validator & Auto-Fixer for Food AR Viewer
 *
 * Usage:
 *   node validate-model.mjs <path-to.glb>              # validate only
 *   node validate-model.mjs <path-to.glb> --fix        # validate + auto-fix
 *   node validate-model.mjs <path-to.glb> --fix --out fixed.glb
 *
 * Exit codes:
 *   0 = PASS (all checks passed)
 *   1 = FAIL (critical issues found, not fixable or --fix not used)
 *   2 = FIXED (had issues, --fix resolved them, output written)
 *
 * See agents.md for architecture overview and debugging guide.
 * See lib/config.mjs for tunable thresholds.
 */

import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { CONFIG } from "./lib/config.mjs";
import { color, ValidationResult } from "./lib/output.mjs";
import { createIO } from "./lib/io.mjs";
import {
  checkFileSize,
  checkMeshes,
  checkExtensions,
  checkTextures,
  checkMaterials,
  checkBoundingBox,
} from "./lib/checks.mjs";
import {
  fixDraco,
  fixUnlitMaterials,
  fixShadowPlanes,
  fixOversizedTextures,
  fixLargeTextures,
  fixDedup,
} from "./lib/fixes.mjs";

// ─── CLI parsing ───────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const files = args.filter((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");

  return {
    filePath: files[0] ? resolve(files[0]) : null,
    shouldFix: flags.includes("--fix"),
    outPath: outIdx !== -1 ? args[outIdx + 1] : null,
  };
}

function printUsage() {
  console.log("");
  console.log(color.bold("  Food AR Model Validator"));
  console.log("");
  console.log("  Usage:");
  console.log("    node validate-model.mjs <model.glb>          Validate only");
  console.log("    node validate-model.mjs <model.glb> --fix    Validate + auto-fix");
  console.log("    node validate-model.mjs <model.glb> --fix --out output.glb");
  console.log("");
  console.log("  Examples:");
  console.log("    node validate-model.mjs ../public/models/burger.glb");
  console.log("    node validate-model.mjs ../public/models/burger.glb --fix");
  console.log("    node validate-model.mjs ../public/models/burger.glb --fix --out ../public/models/burger_fixed.glb");
  console.log("");
}

// ─── Validate ──────────────────────────────────────────────────

async function validate(filePath, doc, fileBytes) {
  const result = new ValidationResult(filePath);
  result.add("PASS", "Valid glTF 2.0 file");

  checkFileSize(result, fileBytes);
  checkMeshes(result, doc);
  const extResult = checkExtensions(result, doc);
  const texResult = checkTextures(result, doc);
  const matResult = checkMaterials(result, doc);
  checkBoundingBox(result, doc);

  return { result, extResult, texResult, matResult };
}

// ─── Fix ───────────────────────────────────────────────────────

async function applyFixes(doc, result, fileBytes, { extResult, texResult, matResult }) {
  let didFix = false;

  if (extResult.hasDraco) {
    await fixDraco(doc, result);
    didFix = true;
  }

  if (extResult.hasUnlit) {
    fixUnlitMaterials(doc, result);
    didFix = true;
  }

  if (matResult.hasShadowPlanes) {
    fixShadowPlanes(doc, result);
    didFix = true;
  }

  if (texResult.hasOversized && texResult.oversizedList.length > 0) {
    await fixOversizedTextures(doc, result, texResult.oversizedList);
    didFix = true;
  }

  const sizeMB = fileBytes / (1024 * 1024);
  if (sizeMB > CONFIG.maxFileSizeMB) {
    await fixLargeTextures(doc, result);
    didFix = true;
  }

  if (didFix) {
    await fixDedup(doc, result);
  }

  return didFix;
}

// ─── Write + re-validate ───────────────────────────────────────

async function writeAndVerify(io, doc, outPath, result) {
  await io.write(outPath, doc);

  const outStat = await stat(outPath);
  const outMB = (outStat.size / (1024 * 1024)).toFixed(2);
  result.addFix("Output", `Written to ${basename(outPath)} (${outMB} MB)`);

  // Quick re-validation of the output
  console.log(color.dim("  Re-validating fixed output..."));
  const fixedDoc = await io.read(outPath);
  const fixedExt = fixedDoc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
  const fixedReq = fixedDoc.getRoot().listExtensionsRequired().map((e) => e.extensionName);

  if (fixedReq.length === 0 && !fixedExt.includes("KHR_draco_mesh_compression")) {
    result.add("PASS", "Post-fix: clean extensions, AR-compatible");
  } else {
    result.add("WARN", "Post-fix", `Remaining extensions: ${fixedExt.join(", ")}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const { filePath, shouldFix, outPath } = parseArgs(process.argv);

  if (!filePath) {
    printUsage();
    process.exit(0);
  }

  // Pre-flight checks
  let fileBytes;
  try {
    const fileStat = await stat(filePath);
    fileBytes = fileStat.size;
  } catch {
    console.error(color.red(`  File not found: ${filePath}`));
    process.exit(1);
  }

  if (!filePath.endsWith(".glb") && !filePath.endsWith(".gltf")) {
    console.error(color.red("  File must be .glb or .gltf"));
    process.exit(1);
  }

  console.log("");
  console.log(color.bold("  Food AR Model Validator"));
  console.log(color.dim("  ─".repeat(30)));

  // Read
  const io = createIO();
  let doc;
  try {
    doc = await io.read(filePath);
  } catch (e) {
    const result = new ValidationResult(filePath);
    result.add("CRITICAL", "File format", `Not a valid glTF file: ${e.message}`);
    result.print();
    process.exit(1);
  }

  // Validate
  const { result, extResult, texResult, matResult } = await validate(filePath, doc, fileBytes);

  // Fix (if requested)
  if (shouldFix) {
    const didFix = await applyFixes(doc, result, fileBytes, { extResult, texResult, matResult });

    if (didFix) {
      const resolvedOut = outPath
        ? resolve(outPath)
        : filePath.replace(/\.glb$/, ".fixed.glb");
      await writeAndVerify(io, doc, resolvedOut, result);
    }
  }

  // Report
  result.print();

  // Exit
  if (result.hasCritical && !result.wasFixed) {
    process.exit(1);
  } else if (result.wasFixed) {
    process.exit(2);
  } else {
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(color.red(`  Unexpected error: ${e.message}`));
  console.error(e.stack);
  process.exit(1);
});
