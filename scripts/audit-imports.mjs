#!/usr/bin/env node
/**
 * ALIA Import Boundary Auditor
 * ============================
 * Scans all .ts and .js files in modules/ and flags any import that crosses
 * module boundaries without going through services/.
 *
 * RULES:
 *   ✅ Allowed: imports within the same module (./*, ../same-module/*)
 *   ✅ Allowed: imports from ../../services/
 *   ✅ Allowed: imports from node_modules (no relative path)
 *   ❌ VIOLATION: modules/ai-core/* importing from ../tts-lipsync/*
 *   ❌ VIOLATION: modules/tts-lipsync/* importing from ../rag-memory/*
 *
 * USAGE:
 *   node scripts/audit-imports.mjs
 *
 * CI:
 *   Exits with code 1 if any violations found.
 *   Add to package.json: "lint:imports": "node scripts/audit-imports.mjs"
 *
 * @fileoverview Cross-module import boundary checker for ALIA monorepo.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** All module names under modules/ */
const MODULES = ['ai-core', 'tts-lipsync', 'rag-memory', 'session-scoring', 'avatar-ui'];

/** Import lines are matched with this regex */
const IMPORT_REGEX = /(?:import|require)\s*(?:[\w{},\s*]+from\s*)?['"]([^'"]+)['"]/g;

/**
 * Recursively collect all .ts and .js files under a directory.
 * @param {string} dir - Directory to scan
 * @returns {string[]} Absolute file paths
 */
function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full));
    } else if (/\.(ts|js|tsx)$/.test(entry) && !entry.includes('.test.') && !entry.includes('.spec.')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Given a file path inside modules/X/*, determine which module it belongs to.
 * @param {string} filePath - Absolute path
 * @returns {string|null} Module name (e.g. 'ai-core') or null if not in modules/
 */
function getModuleOwner(filePath) {
  const rel = relative(join(ROOT, 'modules'), filePath);
  const parts = rel.split(/[\/\\]/);
  return MODULES.includes(parts[0]) ? parts[0] : null;
}

/**
 * Check if an import path from a given source file is a cross-module violation.
 * @param {string} importPath - The raw import string (e.g. '../tts-lipsync/tts.server')
 * @param {string} sourceModule - The module the importing file belongs to
 * @returns {string|null} Violation message or null if allowed
 */
function checkViolation(importPath, sourceModule) {
  // Absolute imports (node_modules) are always allowed
  if (!importPath.startsWith('.')) return null;

  // Allow imports via services/
  if (importPath.includes('services/') || importPath.includes('/services')) return null;

  // Check if the import path reaches into a sibling module
  // e.g. from modules/ai-core/foo.ts, '../tts-lipsync/bar' reaches into tts-lipsync
  for (const otherModule of MODULES) {
    if (otherModule === sourceModule) continue;
    if (importPath.includes(`/${otherModule}/`) || importPath.includes(`/${otherModule}'`) || importPath.endsWith(`/${otherModule}`)) {
      return `Cross-module import → ${otherModule} (use ../../services/ instead)`;
    }
  }

  return null;
}

// ── Main scan ──────────────────────────────────────────────────────────────

const modulesDir = join(ROOT, 'modules');
const files = collectFiles(modulesDir);

let totalFiles = 0;
let violations = 0;
const report = [];

for (const filePath of files) {
  const sourceModule = getModuleOwner(filePath);
  if (!sourceModule) continue;

  totalFiles++;
  const source = readFileSync(filePath, 'utf8');
  const relPath = relative(ROOT, filePath);
  const fileViolations = [];

  let match;
  const lines = source.split('\n');

  // Reset regex state for each file
  IMPORT_REGEX.lastIndex = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineImportRegex = /(?:import|require)\s*(?:[\w{},\s*]+from\s*)?['"]([^'"]+)['"]/g;
    while ((match = lineImportRegex.exec(line)) !== null) {
      const importPath = match[1];
      const violation = checkViolation(importPath, sourceModule);
      if (violation) {
        fileViolations.push(`  Line ${lineNum + 1}: '${importPath}' — ${violation}`);
        violations++;
      }
    }
  }

  if (fileViolations.length > 0) {
    report.push(`❌ ${relPath}`);
    report.push(...fileViolations);
    report.push('');
  } else {
    report.push(`✅ ${relPath}`);
  }
}

console.log('\n📦 ALIA Import Boundary Audit');
console.log('═'.repeat(50));
console.log(report.join('\n'));
console.log('═'.repeat(50));
console.log(`Scanned: ${totalFiles} files | Violations: ${violations}`);

if (violations > 0) {
  console.error(`\n❌ FAIL — ${violations} cross-module import violation(s) found.`);
  console.error('Fix: Replace direct cross-module imports with ../../services/ equivalents.');
  process.exit(1);
} else {
  console.log('\n✅ PASS — No cross-module import violations.');
  process.exit(0);
}
