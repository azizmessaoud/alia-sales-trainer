#!/usr/bin/env node
/**
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
}
