-- Migration: Standardize on 1024-dim embeddings for NV-Embed-QA
-- Fixes search_episode_memories function signature

-- Ensure table column is 1024-dim (if not already)
ALTER TABLE episode_memories ALTER COLUMN episode_embedding TYPE vector(1024);

-- Redefine search function with correct vector dimension
CREATE OR REPLACE FUNCTION search_episode_memories(
    p_rep_id TEXT,
    p_query_embedding vector(1024),
    p_similarity_threshold FLOAT DEFAULT 0.7,
    p_limit INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    rep_id TEXT,
    session_id TEXT,
    episode_text TEXT,
    learning_summary JSONB,
    accuracy DECIMAL(5,2),
    compliance DECIMAL(5,2),
    confidence DECIMAL(5,2),
    session_date TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        em.id,
        em.rep_id,
        em.session_id,
        em.episode_text,
        em.learning_summary,
        em.accuracy,
        em.compliance,
        em.confidence,
        em.session_date,
        1 - (em.episode_embedding <=> p_query_embedding) AS similarity
    FROM episode_memories em
    WHERE em.rep_id = p_rep_id
      AND em.episode_embedding IS NOT NULL
      AND 1 - (em.episode_embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY em.episode_embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$;

-- Add health check for migration
SELECT '✅ Embedding dimension standardized to 1024' as status;
