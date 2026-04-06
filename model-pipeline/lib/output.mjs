/**
 * Terminal output formatting and result collection.
 *
 * ValidationResult collects check outcomes (PASS/WARN/CRITICAL)
 * and fix outcomes, then prints a formatted report.
 */
import { basename } from "node:path";

// ─── Severity levels ───────────────────────────────────────────
export const CRITICAL = "CRITICAL";
export const WARN = "WARN";
export const INFO = "INFO";
export const PASS = "PASS";
export const FIXED = "FIXED";

// ─── Color helpers ─────────────────────────────────────────────
export const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const icons = {
  [CRITICAL]: color.red("✗"),
  [WARN]: color.yellow("⚠"),
  [INFO]: color.cyan("ℹ"),
  [PASS]: color.green("✓"),
  [FIXED]: color.green("🔧"),
};

// ─── Result collector ──────────────────────────────────────────
export class ValidationResult {
  constructor(filePath) {
    this.file = basename(filePath);
    this.checks = [];
    this.fixes = [];
    this.stats = {};
  }

  add(severity, check, message) {
    this.checks.push({ severity, check, message });
  }

  addFix(check, message) {
    this.fixes.push({ check, message });
  }

  get hasCritical() {
    return this.checks.some((c) => c.severity === CRITICAL);
  }

  get hasWarnings() {
    return this.checks.some((c) => c.severity === WARN);
  }

  get wasFixed() {
    return this.fixes.length > 0;
  }

  print() {
    console.log("");
    console.log(color.bold(`  Model: ${this.file}`));
    console.log(color.dim("  ─".repeat(30)));

    for (const c of this.checks) {
      const icon = icons[c.severity];
      const label = c.severity === PASS ? "" : ` [${c.severity}]`;
      console.log(`  ${icon} ${c.check}${label}`);
      if (c.message) console.log(`    ${color.dim(c.message)}`);
    }

    if (this.fixes.length > 0) {
      console.log("");
      console.log(color.bold("  Auto-fixes applied:"));
      for (const f of this.fixes) {
        console.log(`  ${icons[FIXED]} ${f.check}: ${f.message}`);
      }
    }

    console.log("");
    console.log(color.dim("  ─".repeat(30)));

    if (Object.keys(this.stats).length > 0) {
      console.log(color.bold("  Model stats:"));
      for (const [key, val] of Object.entries(this.stats)) {
        console.log(`    ${key}: ${val}`);
      }
      console.log("");
    }

    if (this.hasCritical) {
      console.log(color.red(color.bold("  RESULT: FAIL")));
      if (!this.wasFixed) {
        console.log(color.dim("  Run with --fix to attempt auto-repair"));
      }
    } else if (this.hasWarnings) {
      console.log(color.yellow(color.bold("  RESULT: PASS with warnings")));
    } else {
      console.log(color.green(color.bold("  RESULT: PASS")));
    }
    console.log("");
  }
}
