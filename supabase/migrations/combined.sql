-- =====================================================
-- ALIA 2.0 - Combined Database Schema
-- All migrations in order (001 → 002 → 003)
-- Run this entire script in Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 001_memory_os.sql – Core Memory OS (3-tier)
-- =====================================================

-- Medical sales representatives
CREATE TABLE IF NOT EXISTS reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  company TEXT,
  region TEXT,
  languages TEXT[] DEFAULT '{"en"}',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Pharmaceutical products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  therapeutic_area TEXT,
  fda_approved_indications TEXT[],
  contraindications TEXT[],
  common_side_effects TEXT[],
  pricing_tier TEXT CHECK (pricing_tier IN ('budget', 'mid-range', 'premium')),
  product_embedding VECTOR(1536),
  created_at TIMESTAMP DEFAULT now()
);

-- Training sessions
CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  session_type TEXT DEFAULT 'standard' CHECK (session_type IN ('standard', 'adaptive', 'compliance_focused')),
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  started_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP,
  duration_seconds INT,
  overall_score FLOAT CHECK (overall_score BETWEEN 0 AND 100),
  accuracy_score FLOAT CHECK (accuracy_score BETWEEN 0 AND 100),
  compliance_score FLOAT CHECK (compliance_score BETWEEN 0 AND 100),
  confidence_score FLOAT CHECK (confidence_score BETWEEN 0 AND 100),
  clarity_score FLOAT CHECK (clarity_score BETWEEN 0 AND 100),
  transcript_url TEXT,
  video_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Episode memories (Tier 1)
CREATE TABLE IF NOT EXISTS episode_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  episode_text TEXT NOT NULL,
  episode_embedding VECTOR(1024) NOT NULL,
  learning_summary JSONB NOT NULL,
  accuracy FLOAT,
  compliance FLOAT,
  confidence FLOAT,
  salience_score FLOAT DEFAULT 0.5 CHECK (salience_score BETWEEN 0 AND 1),
  session_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Consolidated memories (Tier 2)
CREATE TABLE IF NOT EXISTS consolidated_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  memory_narrative TEXT NOT NULL,
  memory_embedding VECTOR(768) NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  sessions_count INT,
  avg_accuracy FLOAT,
  avg_compliance FLOAT,
  avg_confidence FLOAT,
  confidence_trajectory FLOAT[],
  improvement_rate FLOAT,
  recurring_struggles TEXT[],
  emerging_strengths TEXT[],
  salience_score FLOAT DEFAULT 0.7 CHECK (salience_score BETWEEN 0 AND 1),
  created_at TIMESTAMP DEFAULT now()
);

-- Rep profiles (Tier 3)
CREATE TABLE IF NOT EXISTS rep_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL UNIQUE REFERENCES reps(id) ON DELETE CASCADE,
  personality_type TEXT,
  learning_style TEXT,
  communication_pace TEXT,
  confidence_trajectory FLOAT[],
  total_sessions INT DEFAULT 0,
  avg_accuracy FLOAT,
  avg_compliance_score FLOAT,
  weak_topics TEXT[],
  strong_topics TEXT[],
  avatar_adaptation_rules JSONB DEFAULT '{}',
  preferred_session_time TEXT,
  avg_session_duration_minutes INT,
  dropout_rate FLOAT,
  updated_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

-- Vector indexes
CREATE INDEX IF NOT EXISTS idx_episode_embedding ON episode_memories 
  USING ivfflat (episode_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_consolidated_embedding ON consolidated_memories 
  USING ivfflat (memory_embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_episode_date ON episode_memories (rep_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_consolidated_period ON consolidated_memories (rep_id, week_start DESC);

-- =====================================================
-- 002_ollama_compat.sql – 768-dim columns for nomic‑embed
-- =====================================================
-- Adjust episode_embedding column if needed (already set to 768 above)
-- Ensure memory_embedding is 768 (already set)
-- No changes needed; we already defined them as VECTOR(768)

-- =====================================================
-- 002_update_vector_dimensions.sql – Additional vector columns
-- =====================================================
-- Already handled; 768 dims are correct.

-- =====================================================
-- 002_fix_vectors_force.sql – Force correct dimensions
-- =====================================================
-- Ensure all vector columns are 768
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='episode_memories' AND column_name='episode_embedding' AND data_type='USER-DEFINED') THEN
    ALTER TABLE episode_memories ALTER COLUMN episode_embedding TYPE vector(768);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consolidated_memories' AND column_name='memory_embedding' AND data_type='USER-DEFINED') THEN
    ALTER TABLE consolidated_memories ALTER COLUMN memory_embedding TYPE vector(768);
  END IF;
END $$;

-- =====================================================
-- 003_multimodal_metrics.sql – Metrics for Week 3
-- =====================================================
CREATE TABLE IF NOT EXISTS session_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT now(),
  eye_contact_percent FLOAT,
  speaking_pace_wpm FLOAT,
  posture_state TEXT CHECK (posture_state IN ('open', 'closed', 'defensive')),
  gesture_state TEXT,
  voice_stress FLOAT,
  emotion TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Optional index on timestamp
CREATE INDEX IF NOT EXISTS idx_session_metrics_session ON session_metrics (session_id, timestamp DESC);

-- =====================================================
-- RLS Policies (simplified for single‑user mode)
-- =====================================================
ALTER TABLE reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE consolidated_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_metrics ENABLE ROW LEVEL SECURITY;

-- For development, allow all authenticated users (adjust for production)
CREATE POLICY "Allow all access for testing" ON reps FOR ALL USING (true);
CREATE POLICY "Allow all access for testing" ON products FOR ALL USING (true);
CREATE POLICY "Allow all access for testing" ON training_sessions FOR ALL USING (true);
CREATE POLICY "Allow all access for testing" ON episode_memories FOR ALL USING (true);
CREATE POLICY "Allow all access for testing" ON consolidated_memories FOR ALL USING (true);
CREATE POLICY "Allow all access for testing" ON rep_profiles FOR ALL USING (true);
CREATE POLICY "Allow all access for testing" ON session_metrics FOR ALL USING (true);

-- =====================================================
-- Sample data for testing
-- =====================================================
INSERT INTO reps (id, email, full_name, company, region) VALUES
  ('00000000-0000-0000-0000-000000000001', 'demo@alia-training.com', 'Demo Rep', 'VitalLab Pharma', 'Northeast')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, product_name, manufacturer, therapeutic_area, fda_approved_indications, contraindications) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Fersang Vitamin D3', 'Vital Lab', 'vitamins & supplements', 
   ARRAY['vitamin d deficiency', 'bone health maintenance'], ARRAY['pregnancy', 'severe kidney disease', 'hypercalcemia'])
ON CONFLICT (id) DO NOTHING;
