-- Migration 003: Canonicalize embeddings to 384-dim
-- Target: paraphrase-multilingual-MiniLM-L12-v2
-- Reason: Fixes 768-dim RPC parameter bug + enables multilingual RAG

-- Step 1: Drop broken RPC (768-dim parameter never matched 1024-dim column)
DROP FUNCTION IF EXISTS search_episode_memories(vector, integer, text);

-- Step 2: Resize column from 1024 → 384
-- NOTE: Sets all existing vectors to NULL — re-embedding required after
ALTER TABLE episode_memories
  ALTER COLUMN episode_embedding TYPE vector(384)
  USING NULL;

-- Step 3: Recreate RPC with correct 384-dim parameter
CREATE OR REPLACE FUNCTION search_episode_memories(
  p_query_embedding vector(384),
  p_limit           integer DEFAULT 5,
  p_rep_id          text    DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  rep_id      text,
  content     text,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT id, rep_id, content,
         1 - (episode_embedding <=> p_query_embedding) AS similarity
  FROM   episode_memories
  WHERE  (p_rep_id IS NULL OR rep_id = p_rep_id)
    AND  episode_embedding IS NOT NULL
  ORDER  BY episode_embedding <=> p_query_embedding
  LIMIT  p_limit;
$$;

-- Step 4: Recreate index for 384-dim
DROP INDEX IF EXISTS episode_memories_embedding_idx;
CREATE INDEX episode_memories_embedding_idx
  ON episode_memories
  USING ivfflat (episode_embedding vector_cosine_ops)
  WITH (lists = 100);

SELECT '✅ Embedding canonicalized to 384-dim' as status;
