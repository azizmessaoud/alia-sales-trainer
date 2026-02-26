-- =====================================================
-- ALIA 2.0: Memory OS Database Schema (Week 1)
-- Layer 1: TeleMem-Inspired 3-Tier Memory System
-- FIXED VERSION: Production-Ready for Supabase
-- =====================================================

-- ⚠️ IMPORTANT: Enable Extensions First!
-- Before running this SQL, go to:
-- Supabase Dashboard → Extensions (left sidebar) → Enable these:
--   1. "vector" (pgvector for semantic search)
--   2. "uuid-ossp" (UUID generation)
-- 
-- If extensions are already enabled, uncomment these lines:
-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Core Tables: Reps, Products, Training Sessions
-- =====================================================

-- Medical sales representatives
CREATE TABLE reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  company TEXT,
  region TEXT,
  languages TEXT[],
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Pharmaceutical products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  therapeutic_area TEXT, -- 'cardiology', 'diabetes', 'oncology'
  
  fda_approved_indications TEXT[],
  contraindications TEXT[],
  common_side_effects TEXT[],
  
  pricing_tier TEXT CHECK (pricing_tier IN ('budget', 'mid-range', 'premium')),
  
  product_embedding VECTOR(1536), -- OpenAI text-embedding-3-small
  
  created_at TIMESTAMP DEFAULT now()
);

-- Training sessions
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  
  session_type TEXT DEFAULT 'standard' CHECK (session_type IN ('standard', 'adaptive', 'compliance_focused')),
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  
  started_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP,
  duration_seconds INT,
  
  -- Final scores
  overall_score FLOAT CHECK (overall_score BETWEEN 0 AND 100),
  accuracy_score FLOAT CHECK (accuracy_score BETWEEN 0 AND 100),
  compliance_score FLOAT CHECK (compliance_score BETWEEN 0 AND 100),
  confidence_score FLOAT CHECK (confidence_score BETWEEN 0 AND 100),
  clarity_score FLOAT CHECK (clarity_score BETWEEN 0 AND 100),
  
  -- Session metadata
  transcript_url TEXT,
  video_url TEXT,
  
  created_at TIMESTAMP DEFAULT now()
);

-- =====================================================
-- LAYER 1: MEMORY OS (3-Tier Hierarchy)
-- =====================================================

-- -------------------------------------------------
-- Tier 1: Episode Memory (Per Session)
-- -------------------------------------------------
-- Stores every training session with semantic embeddings
CREATE TABLE episode_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  
  -- Episode narrative (for embedding)
  episode_text TEXT NOT NULL,
  episode_embedding VECTOR(1536) NOT NULL,
  
  -- Extracted learnings (LLM-generated)
  learning_summary JSONB NOT NULL,
  -- Example: {
  --   "strengths": ["Quick thinking on dosage questions", "Strong product knowledge"],
  --   "struggles": ["Pricing objections", "Contraindication detail"],
  --   "recommended_focus": "Objection handling under pressure"
  -- }
  
  -- Performance metrics snapshot
  accuracy FLOAT,
  compliance FLOAT,
  confidence FLOAT,
  
  -- Salience scoring (importance for future retrieval)
  salience_score FLOAT DEFAULT 0.5 CHECK (salience_score BETWEEN 0 AND 1),
  
  session_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Index for fast vector similarity search
CREATE INDEX idx_episode_embedding ON episode_memories 
  USING ivfflat (episode_embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for date-based queries
CREATE INDEX idx_episode_date ON episode_memories (rep_id, session_date DESC);

-- -------------------------------------------------
-- Tier 2: Consolidated Memory (Weekly Summaries)
-- -------------------------------------------------
-- Aggregated memories with trend analysis
CREATE TABLE consolidated_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  
  -- Consolidated narrative
  memory_narrative TEXT NOT NULL,
  memory_embedding VECTOR(1536) NOT NULL,
  
  -- Time period
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  -- Aggregate metrics
  sessions_count INT,
  avg_accuracy FLOAT,
  avg_compliance FLOAT,
  avg_confidence FLOAT,
  
  -- Trend analysis
  confidence_trajectory FLOAT[], -- [0.65, 0.68, 0.72, 0.78]
  improvement_rate FLOAT, -- % improvement week-over-week
  
  -- Pattern detection
  recurring_struggles TEXT[],
  emerging_strengths TEXT[],
  
  -- ✅ FIXED: salience (not saliance)
  salience_score FLOAT DEFAULT 0.7 CHECK (salience_score BETWEEN 0 AND 1),
  
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_consolidated_embedding ON consolidated_memories 
  USING ivfflat (memory_embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX idx_consolidated_period ON consolidated_memories (rep_id, week_start DESC);

-- -------------------------------------------------
-- Tier 3: Rep Profiles (Long-term Archetype)
-- -------------------------------------------------
-- Persistent personality + learning trajectory
CREATE TABLE rep_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL UNIQUE REFERENCES reps(id) ON DELETE CASCADE,
  
  -- Personality archetype (inferred from behavior)
  personality_type TEXT, -- 'confident', 'cautious', 'analytical', 'creative'
  learning_style TEXT, -- 'kinesthetic', 'visual', 'auditory', 'reading'
  communication_pace TEXT, -- 'fast', 'moderate', 'slow'
  
  -- Long-term trajectory
  confidence_trajectory FLOAT[], -- All-time history
  total_sessions INT DEFAULT 0,
  avg_accuracy FLOAT,
  avg_compliance_score FLOAT,
  
  -- Weakness/strength tracking
  weak_topics TEXT[], -- ['pricing', 'contraindications', 'side_effects']
  strong_topics TEXT[], -- ['dosage', 'interactions', 'efficacy_data']
  
  -- Avatar adaptation rules (personalization config)
  avatar_adaptation_rules JSONB DEFAULT '{}',
  -- Example: {
  --   "speak_pace": "slow",
  --   "interruption_threshold": "high",
  --   "feedback_style": "encouraging",
  --   "complexity_progression": "gradual"
  -- }
  
  -- Engagement metrics
  preferred_session_time TEXT, -- 'morning', 'afternoon', 'evening'
  avg_session_duration_minutes INT,
  dropout_rate FLOAT,
  
  updated_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

-- =====================================================
-- MEMORY RETRIEVAL FUNCTIONS
-- =====================================================

-- Search episode memories by semantic similarity
CREATE OR REPLACE FUNCTION search_episode_memories(
  p_rep_id UUID,
  p_query_embedding VECTOR(1536),
  p_similarity_threshold FLOAT DEFAULT 0.7,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  memory_id UUID,
  memory_text TEXT,
  similarity FLOAT,
  session_date DATE,
  learning_summary JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    episode_text,
    1 - (episode_embedding <=> p_query_embedding) AS similarity,
    session_date,
    learning_summary
  FROM episode_memories
  WHERE rep_id = p_rep_id
    AND 1 - (episode_embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Search consolidated memories (broader context)
CREATE OR REPLACE FUNCTION search_consolidated_memories(
  p_rep_id UUID,
  p_query_embedding VECTOR(1536),
  p_similarity_threshold FLOAT DEFAULT 0.65,
  p_limit INT DEFAULT 3
)
RETURNS TABLE (
  memory_id UUID,
  memory_narrative TEXT,
  similarity FLOAT,
  week_start DATE,
  confidence_trajectory FLOAT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    memory_narrative,
    1 - (memory_embedding <=> p_query_embedding) AS similarity,
    week_start,
    confidence_trajectory
  FROM consolidated_memories
  WHERE rep_id = p_rep_id
    AND 1 - (memory_embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- =====================================================
-- REP PROFILE MANAGEMENT
-- =====================================================

-- Update rep profile after each session
CREATE OR REPLACE FUNCTION update_rep_profile_after_session(
  p_rep_id UUID,
  p_session_scores JSONB
)
RETURNS VOID AS $$
DECLARE
  v_current_trajectory FLOAT[];
  v_new_confidence FLOAT;
BEGIN
  -- Extract confidence score
  v_new_confidence := (p_session_scores->>'confidence_score')::FLOAT;
  
  -- Get current trajectory
  SELECT confidence_trajectory INTO v_current_trajectory
  FROM rep_profiles
  WHERE rep_id = p_rep_id;
  
  -- If profile doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO rep_profiles (rep_id, confidence_trajectory, total_sessions)
    VALUES (p_rep_id, ARRAY[v_new_confidence], 1);
  ELSE
    -- Update existing profile
    UPDATE rep_profiles
    SET 
      confidence_trajectory = array_append(v_current_trajectory, v_new_confidence),
      total_sessions = total_sessions + 1,
      avg_accuracy = (
        SELECT AVG(accuracy_score) 
        FROM training_sessions 
        WHERE rep_id = p_rep_id
      ),
      avg_compliance_score = (
        SELECT AVG(compliance_score) 
        FROM training_sessions 
        WHERE rep_id = p_rep_id
      ),
      updated_at = now()
    WHERE rep_id = p_rep_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- =====================================================
-- AUTOMATED MEMORY CONSOLIDATION (Weekly Cron Job)
-- =====================================================

-- Consolidate episode memories into weekly summary
CREATE OR REPLACE FUNCTION consolidate_weekly_memories(
  p_rep_id UUID,
  p_week_start DATE,
  p_week_end DATE
)
RETURNS UUID AS $$
DECLARE
  v_consolidated_id UUID;
  v_narrative TEXT;
  v_embedding VECTOR(1536);
  v_sessions_count INT;
  v_avg_scores RECORD;
  v_struggles TEXT[];
  v_strengths TEXT[];
BEGIN
  -- Count sessions in period
  SELECT COUNT(*) INTO v_sessions_count
  FROM episode_memories
  WHERE rep_id = p_rep_id
    AND session_date BETWEEN p_week_start AND p_week_end;
  
  -- If no sessions, skip
  IF v_sessions_count = 0 THEN
    RETURN NULL;
  END IF;
  
  -- Calculate averages
  SELECT 
    AVG(accuracy) AS avg_accuracy,
    AVG(compliance) AS avg_compliance,
    AVG(confidence) AS avg_confidence
  INTO v_avg_scores
  FROM episode_memories
  WHERE rep_id = p_rep_id
    AND session_date BETWEEN p_week_start AND p_week_end;
  
  SELECT array_agg(DISTINCT struggle)
  INTO v_struggles
  FROM (
    SELECT jsonb_array_elements_text(learning_summary->'struggles') AS struggle
    FROM episode_memories
    WHERE rep_id = p_rep_id
      AND session_date BETWEEN p_week_start AND p_week_end
  ) sub;
  
  SELECT array_agg(DISTINCT strength)
  INTO v_strengths
  FROM (
    SELECT jsonb_array_elements_text(learning_summary->'strengths') AS strength
    FROM episode_memories
    WHERE rep_id = p_rep_id
      AND session_date BETWEEN p_week_start AND p_week_end
  ) sub;
  
  v_narrative := format(
    'Week of %s: %s sessions completed. Accuracy: %.1f%%, Compliance: %.1f%%, Confidence: %.1f%%. Strengths: %s. Improvements needed: %s',
    p_week_start,
    v_sessions_count,
    v_avg_scores.avg_accuracy,
    v_avg_scores.avg_compliance,
    v_avg_scores.avg_confidence,
    COALESCE(array_to_string(v_strengths, ', '), 'N/A'),
    COALESCE(array_to_string(v_struggles, ', '), 'N/A')
  );
  
  INSERT INTO consolidated_memories (
    rep_id,
    memory_narrative,
    memory_embedding,
    week_start,
    week_end,
    sessions_count,
    avg_accuracy,
    avg_compliance,
    avg_confidence,
    recurring_struggles,
    emerging_strengths
  )
  VALUES (
    p_rep_id,
    v_narrative,
    v_embedding,
    p_week_start,
    p_week_end,
    v_sessions_count,
    v_avg_scores.avg_accuracy,
    v_avg_scores.avg_compliance,
    v_avg_scores.avg_confidence,
    v_struggles,
    v_strengths
  )
  RETURNING id INTO v_consolidated_id;
  
  RETURN v_consolidated_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE consolidated_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Reps can only see their own data
CREATE POLICY rep_isolation ON reps
  FOR ALL
  USING (id = current_setting('app.current_rep_id')::UUID);

CREATE POLICY session_isolation ON training_sessions
  FOR ALL
  USING (rep_id = current_setting('app.current_rep_id')::UUID);

CREATE POLICY episode_isolation ON episode_memories
  FOR ALL
  USING (rep_id = current_setting('app.current_rep_id')::UUID);

CREATE POLICY consolidated_isolation ON consolidated_memories
  FOR ALL
  USING (rep_id = current_setting('app.current_rep_id')::UUID);

CREATE POLICY profile_isolation ON rep_profiles
  FOR ALL
  USING (rep_id = current_setting('app.current_rep_id')::UUID);

-- Products are public (read-only for reps)
CREATE POLICY products_read_all ON products
  FOR SELECT
  USING (true);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_sessions_rep ON training_sessions (rep_id, started_at DESC);
CREATE INDEX idx_sessions_product ON training_sessions (product_id);
CREATE INDEX idx_reps_email ON reps (email);

-- =====================================================
-- SAMPLE DATA (For Testing)
-- =====================================================

INSERT INTO reps (id, email, full_name, company, region)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'demo@alia-training.com', 'Demo Rep', 'VitalLab Pharma', 'Northeast');

INSERT INTO products (id, product_name, manufacturer, therapeutic_area, fda_approved_indications, contraindications)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Fersang Vitamin D3',
  'Vital Lab',
  'vitamins & supplements',
  ARRAY['vitamin d deficiency', 'bone health maintenance'],
  ARRAY['pregnancy', 'severe kidney disease', 'hypercalcemia']
);


-- =====================================================
-- MIGRATION COMPLETE
-- ==========================
-- =====================================================

-- Version: 001
-- Date: 2026-02-25
-- Description: Memory OS (Layer 1) - Episode, Consolidated, Profile tables
