# 🚀 Supabase Migration Quick Start

## Step-by-Step Deployment

### 1️⃣ Enable Extensions (Do This First!)

**Go to:** https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/database/extensions

1. **Search:** `vector`
2. Click **"vector"** → Click **"Enable"**
3. **Search:** `uuid-ossp`  
4. Click **"uuid-ossp"** → Click **"Enable"**

✅ **Wait 5 seconds** for extensions to activate.

---

### 2️⃣ Run SQL Migration

**Go to:** https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/sql/new

1. Click **"New Query"**
2. **Copy ALL** of `supabase/migrations/001_memory_os.sql`
3. **Paste** into SQL Editor
4. Click **▶️ RUN** (bottom right)

**Expected Output:**
```
✅ Success. No rows returned
```

---

### 3️⃣ Verify Tables Created

**Go to:** https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/editor

Check that these 6 tables exist:
- ✅ `reps` (1 row: Demo Rep)
- ✅ `products` (1 row: Fersang Vitamin D3)
- ✅ `training_sessions`
- ✅ `episode_memories` (with `episode_embedding` VECTOR column)
- ✅ `consolidated_memories`
- ✅ `rep_profiles`

---

### 4️⃣ Test the API

```bash
# Test health check
curl http://localhost:5173/api/health

# Run full test suite
node scripts/test-memory-api.js
```

**Expected:**
```
✅ Health check passed
   Supabase: ✅
   OpenAI: ✅
   Memory OS enabled: ✅

✅ Memory stored successfully
✅ Found 1 relevant memories (similarity: 89.2%)
✅ Profile retrieved - Total sessions: 1
```

---

## ⚠️ Troubleshooting

### Error: "extension 'vector' does not exist"
**Solution:** Go back to Extensions tab and manually enable `vector` extension.

### Error: "relation 'reps' already exists"
**Solution:** Tables already created! Skip to Step 3 (Verify).

### Error: "Invalid API key"
**Solution:** Update `.env` with your real OpenAI API key from https://platform.openai.com/api-keys

### Error: "Cannot connect to Supabase"
**Solution:** 
1. Check Supabase project is active
2. Verify `.env` has correct `SUPABASE_URL` and keys
3. Test connection: `curl https://hayzlxsuzachwxazoqxk.supabase.co/rest/v1/`

---

## 📊 What Gets Created

```
Database Schema:
├── Extensions (2)
│   ├── vector (pgvector for semantic search)
│   └── uuid-ossp (UUID generation)
│
├── Tables (6)
│   ├── reps (medical sales reps)
│   ├── products (pharmaceutical products)
│   ├── training_sessions (training records)
│   ├── episode_memories (Tier 1: per-session + embeddings)
│   ├── consolidated_memories (Tier 2: weekly summaries)
│   └── rep_profiles (Tier 3: long-term trajectory)
│
├── Functions (4)
│   ├── search_episode_memories() - Vector similarity search
│   ├── search_consolidated_memories() - Broader context search
│   ├── update_rep_profile_after_session() - Auto-update profiles
│   └── consolidate_weekly_memories() - Weekly aggregation
│
├── Indexes (8)
│   ├── idx_episode_embedding (IVFFlat vector index, 100 lists)
│   ├── idx_consolidated_embedding (IVFFlat vector index, 50 lists)
│   ├── idx_episode_date (Date-based queries)
│   ├── idx_consolidated_period (Weekly queries)
│   └── Performance indexes (sessions, reps, products)
│
└── Sample Data (2 rows)
    ├── Demo Rep (VitalLab Pharma, Northeast)
    └── Fersang Vitamin D3 (Vital Lab, Vitamins)
```

---

## 🎯 Quick Links

- **Supabase Extensions**: https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/database/extensions
- **SQL Editor**: https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/sql/new
- **Table Editor**: https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/editor
- **API Settings**: https://supabase.com/dashboard/project/hayzlxsuzachwxazoqxk/settings/api

---

## ✅ Success Checklist

- [ ] Extensions enabled (vector + uuid-ossp)
- [ ] SQL migration executed successfully
- [ ] All 6 tables visible in Table Editor
- [ ] Sample data loaded (Demo Rep + Product)
- [ ] Health check API passes
- [ ] Test suite runs successfully

**Total Time: ~5 minutes** ⏱️

---

## 📚 Next Steps After Migration

1. ✅ **Week 1 Complete**: Memory OS Layer ready
2. 🔄 **Week 2 Start**: Multimodal sensing (WebRTC + MediaPipe)
3. 🎯 **Competition Goal**: UN SDG AI Innovation Challenge 2026 (Deadline: March 25)

Ready to build the future of medical sales training! 🚀
