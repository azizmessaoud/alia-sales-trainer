/**
 * Apply Migration 002 - Update Vector Dimensions
 * Run this after fixing the SQL file
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
  console.log('\n🔄 Applying Migration 002: Update Vector Dimensions for Phi-3\n');
  
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '002_update_vector_dimensions.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  
  // Split by statement (simple split on semicolon, may need refinement)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`📝 Found ${statements.length} SQL statements\n`);
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: stmt }).single();
      
      if (error) {
        // Try direct query if rpc fails
        const { error: directError } = await supabase.from('_').select('*').limit(0);  // Force connection
        console.warn(`⚠️  Could not use RPC, error:`, error.message);
        console.log(`\n🔗 Please run this SQL manually in Supabase Dashboard → SQL Editor:\n`);
        console.log(stmt);
        console.log('\n');
      } else {
        console.log(`✅ Statement ${i + 1} complete`);
      }
    } catch (err) {
      console.error(`❌ Error on statement ${i + 1}:`, err.message);
      console.log(`\nFailing statement:\n${stmt}\n`);
    }
  }
  
  console.log('\n⚠️  RPC execution may not work. Recommended manual approach:\n');
  console.log('1. Open: https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/sql');
  console.log('2. Paste contents of: supabase/migrations/002_update_vector_dimensions.sql');
  console.log('3. Click "Run"\n');
}

runMigration().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
