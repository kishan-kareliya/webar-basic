#!/usr/bin/env node

/**
 * Batch validator — runs validate-model on every .glb in a directory.
 *
 * Usage:
 *   node validate-all.mjs                          # validates ../public/models/
 *   node validate-all.mjs /path/to/models           # validates custom directory
 *   node validate-all.mjs --fix                     # validates + fixes all, writes .fixed.glb
 *   node validate-all.mjs --fix --replace           # validates + fixes, overwrites originals
 */

import { readdir, stat } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const dirs = args.filter((a) => !a.startsWith("--"));

  const shouldFix = flags.includes("--fix");
  const shouldReplace = flags.includes("--replace");

  const modelsDir = resolve(dirs[0] || join(import.meta.dirname, "..", "public", "models"));

  // Find all .glb files
  let files;
  try {
    const entries = await readdir(modelsDir);
    files = entries.filter((f) => f.endsWith(".glb")).sort();
  } catch {
    console.error(color.red(`  Directory not found: ${modelsDir}`));
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(color.yellow(`  No .glb files found in ${modelsDir}`));
    process.exit(0);
  }

  console.log("");
  console.log(color.bold(`  Batch Model Validation`));
  console.log(color.dim(`  Directory: ${modelsDir}`));
  console.log(color.dim(`  Models: ${files.length}`));
  console.log(color.dim(`  Mode: ${shouldFix ? (shouldReplace ? "fix + replace originals" : "fix (writes .fixed.glb)") : "validate only"}`));
  console.log("");

  const results = { pass: 0, warn: 0, fail: 0, fixed: 0 };
  const scriptPath = resolve(import.meta.dirname, "validate-model.mjs");

  for (const file of files) {
    const filePath = join(modelsDir, file);
    const cmdArgs = [scriptPath, filePath];

    if (shouldFix) {
      cmdArgs.push("--fix");
      if (shouldReplace) {
        cmdArgs.push("--out", filePath);
      }
    }

    try {
      const { stdout, stderr } = await execFileAsync("node", cmdArgs, {
        timeout: 60_000,
      });
      process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      results.pass++;
    } catch (e) {
      // execFile throws on non-zero exit codes
      if (e.stdout) process.stdout.write(e.stdout);
      if (e.stderr) process.stderr.write(e.stderr);

      if (e.code === 2) {
        results.fixed++;
      } else if (e.code === 1 || e.status === 1) {
        results.fail++;
      } else {
        results.fail++;
      }
    }
  }

  // Summary
  console.log(color.bold("  ═".repeat(30)));
  console.log(color.bold("  BATCH SUMMARY"));
  console.log(`  Total:  ${files.length} models`);
  console.log(`  ${color.green("Pass:")}   ${results.pass}`);
  console.log(`  ${color.yellow("Fixed:")}  ${results.fixed}`);
  console.log(`  ${color.red("Fail:")}   ${results.fail}`);
  console.log("");

  if (results.fail > 0) {
    console.log(color.red("  Some models failed validation. Fix them before production."));
    process.exit(1);
  }
  if (results.fixed > 0) {
    if (shouldReplace) {
      console.log(color.green("  All models fixed and replaced in-place."));
    } else {
      console.log(color.yellow("  Fixed models written as .fixed.glb files. Review and rename to replace originals."));
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(color.red(`  Error: ${e.message}`));
  process.exit(1);
});
