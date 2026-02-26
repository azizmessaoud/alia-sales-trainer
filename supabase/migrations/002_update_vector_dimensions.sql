-- =====================================================
-- ALIA 2.0: Migration 002 - Update Vector Dimensions for nomic-embed-text
-- Change from 1536 (OpenAI) to 768 (nomic-embed-text) dimensions
-- Best free local embedding model, fast and accurate
-- =====================================================

-- Update episode_memories
ALTER TABLE episode_memories 
ALTER COLUMN episode_embedding TYPE VECTOR(768);

-- Drop old index
DROP INDEX IF EXISTS episode_memories_embedding_idx;

-- Recreate index with new dimensions
CREATE INDEX episode_memories_embedding_idx 
ON episode_memories 
USING ivfflat (episode_embedding vector_cosine_ops)
WITH (lists = 100);

-- Update consolidated_memories
ALTER TABLE consolidated_memories 
ALTER COLUMN memory_embedding TYPE VECTOR(768);

-- Drop old index
DROP INDEX IF EXISTS consolidated_memories_embedding_idx;

-- Recreate index
CREATE INDEX consolidated_memories_embedding_idx 
ON consolidated_memories 
USING ivfflat (memory_embedding vector_cosine_ops)
WITH (lists = 50);

-- Update products table
ALTER TABLE products 
ALTER COLUMN product_embedding TYPE VECTOR(768);

-- Update search functions to use correct dimensions
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
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    em.id AS memory_id,
    em.episode_text AS memory_text,
    1 - (em.episode_embedding <=> p_query_embedding) AS similarity,
    em.session_date,
    em.learning_summary
  FROM episode_memories em
  WHERE em.rep_id = p_rep_id
    AND 1 - (em.episode_embedding <=> p_query_embedding) >= p_similarity_threshold
  ORDER BY em.episode_embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_consolidated_memories(
  p_rep_id UUID,
  p_query_embedding VECTOR(768),
  p_match_count INT DEFAULT 3
)
RETURNS TABLE (
  memory_id UUID,
  memory_narrative TEXT,
  similarity FLOAT,
  week_start DATE,
  week_end DATE,
  recurring_struggles TEXT[],
  emerging_strengths TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id AS memory_id,
    cm.memory_narrative,
    1 - (cm.memory_embedding <=> p_query_embedding) AS similarity,
    cm.week_start,
    cm.week_end,
    cm.recurring_struggles,
    cm.emerging_strengths
  FROM consolidated_memories cm
  WHERE cm.rep_id = p_rep_id
    AND 1 - (cm.memory_embedding <=> p_query_embedding) >= p_similarity_threshold
  ORDER BY cm.memory_embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;
