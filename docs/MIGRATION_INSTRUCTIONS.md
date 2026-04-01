# ALIA 2.0 - Apply Vector Dimension Migration

## Quick Fix (Copy-paste to Supabase)

1. **Open Supabase SQL Editor:**
   https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/sql

2. **Copy the entire contents of:**
   `supabase/migrations/002_update_vector_dimensions.sql`

3. **Paste and click "Run"**

4. **Verify success:** You should see "Success. No rows returned"

---

## What This Does

- Changes vector columns from **1536** → **768** dimensions
- Updates: `episode_memories`, `consolidated_memories`, `products`  
- Recreates indexes for cosine similarity search
- Updates search functions to accept 768-dim vectors

---

## After Migration

Restart the server:
```powershell
# Stop current server (Ctrl+C if running)
# OR force kill:
Get-Process -Name node | Stop-Process -Force

# Start with new config
cd "C:\Users\thinkpad x13 Gen4\Desktop\lifos\alia-medical-training"
node server-ollama.js
```

Then test:
```powershell
node scripts/test-memory-api-ollama.js
```

Expected: ✅✅✅✅ All tests pass, <5s total time

---

## Config Summary

| Component | Value |
|-----------|-------|
| Chat Model | `phi3` (2.2 GB) |
| Embed Model | `nomic-embed-text` (274 MB, 768-dim) |
| Vector Dims | 768 |
| Supabase URL | hayzlxsuzachwxazoqxk.supabase.co |
| Server Port | 3000 |
