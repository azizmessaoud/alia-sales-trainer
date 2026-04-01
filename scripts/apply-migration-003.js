#!/usr/bin/env node

/**
 * Apply Migration 003 - Canonicalize embeddings to 384-dim
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('\n🔄 Applying Migration 003: Canonicalize embeddings to 384-dim\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '003_embedding_384.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // Split by statements (conservative approach)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

  console.log(`📝 Found ${statements.length} SQL statements\n`);

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    const shortStmt = stmt.slice(0, 50).replace('\n', ' ') + (stmt.length > 50 ? '...' : '');
    
    console.log(`[${i + 1}/${statements.length}] Executing: ${shortStmt}`);

    try {
      // Use raw query via Supabase
      const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });

      if (error) {
        // If RPC not available, try direct execution
        console.warn(`   ⚠️  RPC failed, attempting direct query...`);
        console.log(`\n   Manual SQL needed (paste into Supabase SQL Editor):\n`);
        console.log(`   ${stmt}\n`);
        failureCount++;
      } else {
        console.log(`   ✅ Success\n`);
        successCount++;
      }
    } catch (err) {
      console.error(`   ❌ Error:`, err.message);
      console.log(`\n   Failing statement:\n   ${stmt}\n`);
      failureCount++;
    }
  }

  console.log(`\n📊 Results: ${successCount} succeeded, ${failureCount} failed\n`);

  if (failureCount > 0) {
    console.log(`⚠️  Some statements could not be executed via RPC.\n`);
    console.log(`📋 Manual approach (recommended if RPC auth unavailable):\n`);
    console.log(`   1. Go to: https://supabase.com/dashboard/project/[YOUR_PROJECT_ID]/sql\n`);
    console.log(`   2. Create new query and paste:\n\n`);
    console.log(sql);
    console.log(`\n   3. Click "Run"\n`);
    process.exit(1);
  } else {
    console.log('✅ Migration 003 applied successfully!\n');
  }
}

runMigration().catch(err => {
  console.error('\n❌ Migration execution failed:', err.message);
  process.exit(1);
});
