-- =====================================================
-- ALIA 2.0: FORCE Vector Dimension Update to 768
-- Clear existing data if needed, then update dimensions
-- =====================================================

-- Step 1: Clear existing vectors (if any exist)
DELETE FROM episode_memories WHERE episode_embedding IS NOT NULL;
DELETE FROM consolidated_memories WHERE memory_embedding IS NOT NULL;
DELETE FROM products WHERE product_embedding IS NOT NULL;

-- Step 2: Drop indexes
DROP INDEX IF EXISTS episode_memories_embedding_idx;
DROP INDEX IF EXISTS consolidated_memories_embedding_idx;

-- Step 3: Drop and recreate columns with correct dimensions
ALTER TABLE episode_memories 
  DROP COLUMN IF EXISTS episode_embedding;

ALTER TABLE episode_memories 
  ADD COLUMN episode_embedding VECTOR(768);

ALTER TABLE consolidated_memories 
  DROP COLUMN IF EXISTS memory_embedding;

ALTER TABLE consolidated_memories 
  ADD COLUMN memory_embedding VECTOR(768);

ALTER TABLE products 
  DROP COLUMN IF EXISTS product_embedding;

ALTER TABLE products 
  ADD COLUMN product_embedding VECTOR(768);

-- Step 4: Recreate indexes
CREATE INDEX episode_memories_embedding_idx 
  ON episode_memories 
  USING ivfflat (episode_embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX consolidated_memories_embedding_idx 
  ON consolidated_memories 
  USING ivfflat (memory_embedding vector_cosine_ops)
  WITH (lists = 50);

-- Step 5: Update search functions with correct dimensions
CREATE OR REPLACE FUNCTION search_episode_memories(
  p_rep_id UUID,
  p_query_embedding VECTOR(768),
  p_similarity_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  memory_id UUID,
  memory_text TEXT,
  similarity FLOAT,
  session_date TIMESTAMP,
  learning_summary JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    em.id,
    em.episode_text,
    1 - (em.episode_embedding <=> p_query_embedding) AS similarity,
    ts.started_at,
    em.episode_metadata
  FROM episode_memories em
  JOIN training_sessions ts ON em.session_id = ts.id
  WHERE em.rep_id = p_rep_id
    AND em.episode_embedding IS NOT NULL
    AND (1 - (em.episode_embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY similarity DESC
  LIMIT p_match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_consolidated_memories(
  p_rep_id UUID,
  p_query_embedding VECTOR(768),
  p_similarity_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  memory_id UUID,
  memory_text TEXT,
  memory_type TEXT,
  similarity FLOAT,
  consolidation_date TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id,
    cm.consolidated_text,
    cm.memory_type,
    1 - (cm.memory_embedding <=> p_query_embedding) AS similarity,
    cm.created_at
  FROM consolidated_memories cm
  WHERE cm.rep_id = p_rep_id
    AND cm.memory_embedding IS NOT NULL
    AND (1 - (cm.memory_embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY similarity DESC
  LIMIT p_match_count;
END;
$$;
