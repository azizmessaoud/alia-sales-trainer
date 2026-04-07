-- =====================================================
-- ALIA RAG Hotfix Migration (2026-04-07)
-- Standardize memory search path on 768-dim embeddings
-- Adds missing RPCs used by server-ollama + rag-memory modules
-- =====================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- Core tables (create only when missing)
-- =====================================================

CREATE TABLE IF NOT EXISTS episode_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  episode_text TEXT NOT NULL,
  episode_embedding vector(768),
  learning_summary JSONB DEFAULT '{}'::jsonb,
  accuracy DECIMAL(5,2) DEFAULT 0,
  compliance DECIMAL(5,2) DEFAULT 0,
  confidence DECIMAL(5,2) DEFAULT 0,
  salience_score DECIMAL(3,2) DEFAULT 0.5,
  session_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consolidated_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id TEXT NOT NULL,
  memory_narrative TEXT NOT NULL,
  memory_embedding vector(768),
  week_start DATE,
  week_end DATE,
  sessions_count INT DEFAULT 0,
  avg_accuracy DECIMAL(5,2) DEFAULT 0,
  avg_compliance DECIMAL(5,2) DEFAULT 0,
  avg_confidence DECIMAL(5,2) DEFAULT 0,
  confidence_trajectory FLOAT[] DEFAULT ARRAY[]::FLOAT[],
  recurring_struggles TEXT[] DEFAULT ARRAY[]::TEXT[],
  emerging_strengths TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rep_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id TEXT UNIQUE NOT NULL,
  personality_type TEXT,
  learning_style TEXT,
  communication_pace TEXT,
  confidence_trajectory FLOAT[] DEFAULT ARRAY[]::FLOAT[],
  total_sessions INT DEFAULT 0,
  avg_accuracy DECIMAL(5,2) DEFAULT 0,
  avg_compliance_score DECIMAL(5,2) DEFAULT 0,
  weak_topics TEXT[] DEFAULT ARRAY[]::TEXT[],
  strong_topics TEXT[] DEFAULT ARRAY[]::TEXT[],
  avatar_adaptation_rules JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add compatibility columns when running against older schema variants
ALTER TABLE rep_profiles ADD COLUMN IF NOT EXISTS confidence_trajectory FLOAT[] DEFAULT ARRAY[]::FLOAT[];
ALTER TABLE rep_profiles ADD COLUMN IF NOT EXISTS total_sessions INT DEFAULT 0;
ALTER TABLE rep_profiles ADD COLUMN IF NOT EXISTS avg_accuracy DECIMAL(5,2) DEFAULT 0;
ALTER TABLE rep_profiles ADD COLUMN IF NOT EXISTS avg_compliance_score DECIMAL(5,2) DEFAULT 0;
ALTER TABLE rep_profiles ADD COLUMN IF NOT EXISTS weak_topics TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE rep_profiles ADD COLUMN IF NOT EXISTS strong_topics TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE rep_profiles ADD COLUMN IF NOT EXISTS avatar_adaptation_rules JSONB DEFAULT '{}'::jsonb;
ALTER TABLE rep_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================
-- Normalize vector dimensions (safe reset if incompatible)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'episode_memories' AND column_name = 'episode_embedding'
  ) THEN
    ALTER TABLE episode_memories
      ALTER COLUMN episode_embedding TYPE vector(768)
      USING CASE
        WHEN episode_embedding IS NULL THEN NULL
        ELSE NULL::vector(768)
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'consolidated_memories' AND column_name = 'memory_embedding'
  ) THEN
    ALTER TABLE consolidated_memories
      ALTER COLUMN memory_embedding TYPE vector(768)
      USING CASE
        WHEN memory_embedding IS NULL THEN NULL
        ELSE NULL::vector(768)
      END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_episode_memories_rep_id ON episode_memories(rep_id);
CREATE INDEX IF NOT EXISTS idx_episode_memories_session_date ON episode_memories(session_date DESC);
CREATE INDEX IF NOT EXISTS idx_episode_memories_embedding_768
  ON episode_memories
  USING ivfflat (episode_embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_consolidated_memories_rep_id ON consolidated_memories(rep_id);
CREATE INDEX IF NOT EXISTS idx_consolidated_memories_period ON consolidated_memories(week_start DESC, week_end DESC);
CREATE INDEX IF NOT EXISTS idx_consolidated_memories_embedding_768
  ON consolidated_memories
  USING ivfflat (memory_embedding vector_cosine_ops)
  WITH (lists = 50);

-- =====================================================
-- RPC 1: Episode semantic search (used by server-ollama + memory-os)
-- =====================================================

CREATE OR REPLACE FUNCTION search_episode_memories(
  p_rep_id TEXT,
  p_query_embedding vector(768),
  p_similarity_threshold FLOAT DEFAULT 0.7,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  memory_id UUID,
  rep_id TEXT,
  session_id TEXT,
  memory_text TEXT,
  learning_summary JSONB,
  accuracy DECIMAL(5,2),
  compliance DECIMAL(5,2),
  confidence DECIMAL(5,2),
  salience_score DECIMAL(3,2),
  session_date TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    em.id AS memory_id,
    em.rep_id::TEXT AS rep_id,
    em.session_id::TEXT AS session_id,
    em.episode_text AS memory_text,
    em.learning_summary,
    em.accuracy::DECIMAL(5,2) AS accuracy,
    em.compliance::DECIMAL(5,2) AS compliance,
    em.confidence::DECIMAL(5,2) AS confidence,
    em.salience_score::DECIMAL(3,2) AS salience_score,
    em.session_date,
    1 - (em.episode_embedding <=> p_query_embedding) AS similarity
  FROM episode_memories em
  WHERE em.rep_id::TEXT = p_rep_id
    AND em.episode_embedding IS NOT NULL
    AND 1 - (em.episode_embedding <=> p_query_embedding) >= p_similarity_threshold
  ORDER BY em.episode_embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- RPC 2: Consolidated semantic search (used by rag-pipeline)
-- =====================================================

CREATE OR REPLACE FUNCTION search_consolidated_memories(
  p_rep_id TEXT,
  p_query_embedding vector(768),
  p_similarity_threshold FLOAT DEFAULT 0.65,
  p_limit INT DEFAULT 3
)
RETURNS TABLE (
  memory_id UUID,
  rep_id TEXT,
  memory_text TEXT,
  week_start DATE,
  week_end DATE,
  sessions_count INT,
  avg_accuracy DECIMAL(5,2),
  avg_compliance DECIMAL(5,2),
  avg_confidence DECIMAL(5,2),
  confidence_trajectory FLOAT[],
  recurring_struggles TEXT[],
  emerging_strengths TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id AS memory_id,
    cm.rep_id::TEXT AS rep_id,
    cm.memory_narrative AS memory_text,
    cm.week_start,
    cm.week_end,
    cm.sessions_count,
    cm.avg_accuracy::DECIMAL(5,2),
    cm.avg_compliance::DECIMAL(5,2),
    cm.avg_confidence::DECIMAL(5,2),
    cm.confidence_trajectory,
    cm.recurring_struggles,
    cm.emerging_strengths,
    1 - (cm.memory_embedding <=> p_query_embedding) AS similarity
  FROM consolidated_memories cm
  WHERE cm.rep_id::TEXT = p_rep_id
    AND cm.memory_embedding IS NOT NULL
    AND 1 - (cm.memory_embedding <=> p_query_embedding) >= p_similarity_threshold
  ORDER BY cm.memory_embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- RPC 3: Profile update after each session (used by memory-os)
-- =====================================================

CREATE OR REPLACE FUNCTION update_rep_profile_after_session(
  p_rep_id TEXT,
  p_session_scores JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_accuracy FLOAT := COALESCE((p_session_scores->>'accuracy')::FLOAT, 0);
  v_compliance FLOAT := COALESCE((p_session_scores->>'compliance')::FLOAT, 0);
  v_confidence FLOAT := COALESCE((p_session_scores->>'confidence')::FLOAT, 0);
BEGIN
  INSERT INTO rep_profiles (
    rep_id,
    total_sessions,
    avg_accuracy,
    avg_compliance_score,
    confidence_trajectory,
    updated_at
  ) VALUES (
    p_rep_id,
    1,
    v_accuracy,
    v_compliance,
    ARRAY[v_confidence],
    NOW()
  )
  ON CONFLICT (rep_id)
  DO UPDATE SET
    total_sessions = rep_profiles.total_sessions + 1,
    avg_accuracy = ROUND((
      (
        COALESCE(rep_profiles.avg_accuracy, 0) * rep_profiles.total_sessions
      ) + v_accuracy
    )::NUMERIC / NULLIF(rep_profiles.total_sessions + 1, 0), 2),
    avg_compliance_score = ROUND((
      (
        COALESCE(rep_profiles.avg_compliance_score, 0) * rep_profiles.total_sessions
      ) + v_compliance
    )::NUMERIC / NULLIF(rep_profiles.total_sessions + 1, 0), 2),
    confidence_trajectory = COALESCE(rep_profiles.confidence_trajectory, ARRAY[]::FLOAT[]) || v_confidence,
    updated_at = NOW();
END;
$$;

-- =====================================================
-- RPC 4: Weekly consolidation helper (used by memory-os)
-- =====================================================

CREATE OR REPLACE FUNCTION consolidate_weekly_memories(
  p_rep_id TEXT,
  p_week_start DATE,
  p_week_end DATE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_sessions_count INT;
  v_avg_accuracy FLOAT;
  v_avg_compliance FLOAT;
  v_avg_confidence FLOAT;
  v_trajectory FLOAT[];
BEGIN
  SELECT
    COUNT(*)::INT,
    COALESCE(AVG(em.accuracy::FLOAT), 0),
    COALESCE(AVG(em.compliance::FLOAT), 0),
    COALESCE(AVG(em.confidence::FLOAT), 0),
    COALESCE(ARRAY_AGG(em.confidence::FLOAT ORDER BY em.session_date), ARRAY[]::FLOAT[])
  INTO
    v_sessions_count,
    v_avg_accuracy,
    v_avg_compliance,
    v_avg_confidence,
    v_trajectory
  FROM episode_memories em
  WHERE em.rep_id::TEXT = p_rep_id
    AND em.session_date::DATE BETWEEN p_week_start AND p_week_end;

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
    confidence_trajectory,
    recurring_struggles,
    emerging_strengths
  ) VALUES (
    p_rep_id,
    format(
      'Weekly summary for %s (%s to %s): %s sessions, avg accuracy %.2f, avg compliance %.2f, avg confidence %.2f',
      p_rep_id,
      p_week_start,
      p_week_end,
      v_sessions_count,
      v_avg_accuracy,
      v_avg_compliance,
      v_avg_confidence
    ),
    NULL,
    p_week_start,
    p_week_end,
    v_sessions_count,
    v_avg_accuracy,
    v_avg_compliance,
    v_avg_confidence,
    v_trajectory,
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[]
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

SELECT '✅ 20260407_rag_functions.sql applied' AS status;
