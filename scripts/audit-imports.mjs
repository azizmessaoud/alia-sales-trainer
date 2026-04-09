#!/usr/bin/env node
/**
<<<<<<< HEAD
 * ALIA 2.0 - Import Audit Script
 * 
 * Scans all .ts and .js files in modules/ and flags any import that crosses
 * module boundaries (not via services/ or node_modules or ~/)
 * 
 * Usage: node scripts/audit-imports.mjs
 * 
 * Expected output:
 *   PASS ✅ modules/ai-core/orchestration.server.ts
 *   FAIL ❌ modules/tts-lipsync/illegal-import.ts
 * 
 * Exit code: 1 if any violations found (usable in CI)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const MODULES = ['ai-core', 'tts-lipsync', 'rag-memory', 'session-scoring', 'avatar-ui'];
const ALLOWED_CROSS_MODULE_PATHS = [
  '../../services/',       // Services layer
  '~/',                    // Workspace root
  'node_modules/',         // External dependencies
  '../',                   // Parent directory (for scripts inside modules)
];

// File extensions to scan
const FILE_EXTENSIONS = ['.ts', '.js'];

// Track violations
const violations = [];

/**
 * Get all TypeScript and JavaScript files in modules/
 */
function getAllSourceFiles() {
  const files = [];
  
  for (const module of MODULES) {
    const modulePath = path.join(__dirname, '..', 'modules', module);
    
    if (!fs.existsSync(modulePath)) {
      console.warn(`⚠️  Module directory not found: ${modulePath}`);
      continue;
    }
    
    // Recursively scan the module directory
    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories and node_modules
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          // Check file extension
          const ext = path.extname(entry.name);
          if (FILE_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    scanDir(modulePath);
  }
  
  return files;
}

/**
 * Check if a path is allowed
 */
function isPathAllowed(importPath) {
  // Normalize the path for comparison
  const normalizedImportPath = importPath.replace(/\\/g, '/');
  
  // Check if it's an allowed cross-module path
  for (const allowedPath of ALLOWED_CROSS_MODULE_PATHS) {
    if (normalizedImportPath.includes(allowedPath)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get the module name from a file path
 */
function getModuleName(filePath) {
  const relativePath = path.relative(path.join(__dirname, '..', 'modules'), filePath);
  const parts = relativePath.split(path.sep);
  
  // The module name is the first directory after modules/
  if (parts.length > 0 && MODULES.includes(parts[0])) {
    return parts[0];
  }
  
  return null;
}

/**
 * Analyze a single file for import violations
 */
function analyzeFile(filePath) {
  const moduleName = getModuleName(filePath);
  if (!moduleName) {
    return { violations: [] };
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const violationsInFile = [];
  
  // Regex to match import statements
  // Matches: import X from 'path';, import { X, Y } from 'path';
  // Also matches: import * as X from 'path';
  const importRegex = /import\s+(?:(?:[\w{},\s*]+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;
  
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    
    // Skip node_modules
    if (importPath.startsWith('node_modules/')) {
      continue;
    }
    
    // Skip tilde imports (workspace root)
    if (importPath.startsWith('~/')) {
      continue;
    }
    
    // Skip relative imports to services/
    if (importPath.startsWith('../../services/')) {
      continue;
    }
    
    // Skip relative imports to app/ (should use ~/)
    if (importPath.startsWith('../app/') || importPath.startsWith('../../app/')) {
      violationsInFile.push({
        line: match.index,
        importPath: importPath,
        reason: 'Should use ~/ for workspace root imports'
      });
      continue;
    }
    
    // Skip relative imports to other modules
    // Check if the import path goes to a different module directory
    const normalizedImportPath = importPath.replace(/\\/g, '/');
    
    // Check if the import goes to a different module
    for (const otherModule of MODULES) {
      if (normalizedImportPath.includes(`/${otherModule}/`)) {
        // Check if it's an allowed path
        if (!isPathAllowed(importPath)) {
          violationsInFile.push({
            line: match.index,
            importPath: importPath,
            reason: `Cross-module import to ${otherModule}/ (not via services/ or ~/)`
          });
        }
        break;
      }
    }
  }
  
  return { violations: violationsInFile };
}

/**
 * Main audit function
 */
function auditImports() {
  console.log('🔍 ALIA 2.0 - Import Audit\n');
  console.log(`Scanning ${MODULES.length} modules...\n`);
  
  const files = getAllSourceFiles();
  console.log(`Found ${files.length} source files\n`);
  
  let totalViolations = 0;
  
  for (const file of files) {
    const { violations: fileViolations } = analyzeFile(file);
    
    if (fileViolations.length > 0) {
      totalViolations += fileViolations.length;
      
      const moduleName = getModuleName(file);
      console.log(`❌ FAIL ${file}`);
      console.log(`   Module: ${moduleName}`);
      
      for (const violation of fileViolations) {
        console.log(`   Line ${violation.line}: ${violation.importPath}`);
        console.log(`   Reason: ${violation.reason}`);
      }
      console.log('');
    } else {
      console.log(`✅ PASS ${file}`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total files scanned: ${files.length}`);
  console.log(`Files with violations: ${files.length - violations.length}`);
  console.log(`Total violations: ${totalViolations}`);
  console.log('');
  
  if (totalViolations === 0) {
    console.log('✅ No import violations found!');
    console.log('All imports are properly structured.');
    process.exit(0);
  } else {
    console.log('❌ Import violations detected!');
    console.log('Please fix the violations before committing.');
    process.exit(1);
  }
}

// Run the audit
try {
  auditImports();
} catch (error) {
  console.error('❌ Error running audit:', error);
  process.exit(1);
=======
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
>>>>>>> 87ed2b758e4bb90dd89e1ed37d75c1549609dda2
}
