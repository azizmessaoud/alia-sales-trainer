-- =====================================================
-- ALIA 2.0 Memory OS - Database Schema
-- UN SDG AI Innovation Challenge 2026
-- =====================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- EPISODIC MEMORY: Training Sessions
-- =====================================================

CREATE TABLE IF NOT EXISTS episode_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rep_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    episode_text TEXT NOT NULL,
    episode_embedding vector(1024), -- 1024-dim for NV-Embed-QA
    learning_summary JSONB DEFAULT '{}',
    accuracy DECIMAL(5,2) DEFAULT 0,
    compliance DECIMAL(5,2) DEFAULT 0,
    confidence DECIMAL(5,2) DEFAULT 0,
    clarity DECIMAL(5,2) DEFAULT 0,
    salience_score DECIMAL(3,2) DEFAULT 0.8,
    session_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episode_memories_rep_id ON episode_memories(rep_id);
CREATE INDEX IF NOT EXISTS idx_episode_memories_session_id ON episode_memories(session_id);
CREATE INDEX IF NOT EXISTS idx_episode_memories_session_date ON episode_memories(session_date DESC);

-- Vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_episode_memories_embedding ON episode_memories 
USING ivfflat (episode_embedding vector_cosine_ops)
WITH (lists = 100);

-- =====================================================
-- SEMANTIC MEMORY: Vector Search Function
-- =====================================================

CREATE OR REPLACE FUNCTION search_episode_memories(
    p_rep_id TEXT,
    p_query_embedding vector(768),
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

-- =====================================================
-- LONG-TERM MEMORY: Rep Profiles
-- =====================================================

CREATE TABLE IF NOT EXISTS rep_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rep_id TEXT UNIQUE NOT NULL,
    name TEXT,
    email TEXT,
    company TEXT,
    
    -- Competency scores (0-100)
    product_knowledge DECIMAL(5,2) DEFAULT 50,
    objection_handling DECIMAL(5,2) DEFAULT 50,
    communication_skills DECIMAL(5,2) DEFAULT 50,
    compliance_awareness DECIMAL(5,2) DEFAULT 50,
    
    -- Learning trajectory
    total_sessions INT DEFAULT 0,
    total_training_hours DECIMAL(6,2) DEFAULT 0,
    average_accuracy DECIMAL(5,2) DEFAULT 0,
    average_compliance DECIMAL(5,2) DEFAULT 0,
    average_confidence DECIMAL(5,2) DEFAULT 0,
    
    -- Weak areas (auto-detected from struggles)
    weak_areas TEXT[] DEFAULT '{}',
    strong_areas TEXT[] DEFAULT '{}',
    recommended_focus TEXT,
    
    -- Streaks & motivation
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    last_session_date TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_profiles_rep_id ON rep_profiles(rep_id);

-- =====================================================
-- TRAINING SCENARIOS
-- =====================================================

CREATE TABLE IF NOT EXISTS training_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT, -- 'objection_handling', 'product_knowledge', 'compliance', 'closing'
    difficulty INT DEFAULT 1, -- 1-5
    doctor_persona JSONB DEFAULT '{}',
    expected_objections TEXT[],
    success_criteria JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_scenarios_category ON training_scenarios(category);
CREATE INDEX IF NOT EXISTS idx_training_scenarios_difficulty ON training_scenarios(difficulty);

-- =====================================================
-- SESSION METRICS (Multimodal)
-- =====================================================

CREATE TABLE IF NOT EXISTS session_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    rep_id TEXT NOT NULL,
    
    -- Timing metrics
    response_time_ms INT,
    total_session_duration_ms INT,
    
    -- Speech metrics
    words_per_minute DECIMAL(5,2),
    filler_word_count INT DEFAULT 0,
    pause_count INT DEFAULT 0,
    
    -- Multimodal metrics
    eye_contact_percentage DECIMAL(5,2),
    posture_score DECIMAL(5,2),
    stress_level DECIMAL(3,2),
    smile_percentage DECIMAL(5,2),
    
    -- Engagement
    engagement_score DECIMAL(5,2),
    
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_metrics_session_id ON session_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_session_metrics_rep_id ON session_metrics(rep_id);

-- =====================================================
-- SDG METRICS TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS sdg_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rep_id TEXT NOT NULL,
    
    -- SDG 3: Good Health & Well-being
    training_sessions_completed INT DEFAULT 0,
    competency_improvement_rate DECIMAL(5,2) DEFAULT 0,
    
    -- SDG 4: Quality Education
    hours_of_training DECIMAL(6,2) DEFAULT 0,
    knowledge_assessment_score DECIMAL(5,2) DEFAULT 0,
    
    -- SDG 8: Decent Work & Economic Growth
    sales_effectiveness_improvement DECIMAL(5,2) DEFAULT 0,
    compliance_rate DECIMAL(5,2) DEFAULT 0,
    
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rep_id)
);

CREATE INDEX IF NOT EXISTS idx_sdg_metrics_rep_id ON sdg_metrics(rep_id);

-- =====================================================
-- ANALYTICS VIEW
-- =====================================================

CREATE OR REPLACE VIEW v_rep_progress AS
SELECT 
    rp.rep_id,
    rp.name,
    rp.total_sessions,
    rp.average_accuracy,
    rp.average_compliance,
    rp.current_streak,
    rp.last_session_date,
    rp.weak_areas,
    rp.strong_areas,
    sm.avg_eye_contact,
    sm.avg_stress_level,
    sm.avg_engagement
FROM rep_profiles rp
LEFT JOIN (
    SELECT 
        rep_id,
        AVG(eye_contact_percentage) as avg_eye_contact,
        AVG(stress_level) as avg_stress_level,
        AVG(engagement_score) as avg_engagement
    FROM session_metrics
    GROUP BY rep_id
) sm ON rp.rep_id = sm.rep_id;

-- =====================================================
-- SEED DATA: Sample Scenarios
-- =====================================================

INSERT INTO training_scenarios (title, description, category, difficulty, expected_objections) VALUES
('Product Introduction', 'Introduce our new cardiology medication to a cardiologist', 'product_knowledge', 2, ARRAY['cost', 'efficacy', 'competition']),
('Price Objection', 'Handle a doctor who says the medication is too expensive', 'objection_handling', 3, ARRAY['cost', 'budget', 'insurance']),
('Compliance Check', 'Discuss off-label use without making claims', 'compliance', 4, ARRAY['off_label', 'research']),
('Closing the Meeting', 'Successfully conclude a productive meeting', 'closing', 3, ARRAY['time', 'follow_up'])
ON CONFLICT DO 

-- Verify tables created
SELECT '✅ Memory OS initialized' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

e;

