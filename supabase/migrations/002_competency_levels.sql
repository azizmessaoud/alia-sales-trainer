-- =====================================================
-- ALIA 2.0 Competency Level System
-- UN SDG AI Innovation Challenge 2026
-- =====================================================

-- =====================================================
-- COMPETENCY LEVEL DEFINITIONS
-- =====================================================

-- Create a table to store competency level definitions
CREATE TABLE IF NOT EXISTS competency_levels (
    id SERIAL PRIMARY KEY,
    level_code TEXT UNIQUE NOT NULL, -- 'BEGINNER', 'JUNIOR', 'CONFIRMED', 'EXPERT'
    level_name_fr TEXT NOT NULL, -- 'Débutant', 'Junior', 'Confirmé', 'Expert'
    level_name_en TEXT NOT NULL, -- 'Beginner', 'Junior', 'Confirmed', 'Expert'
    level_number INT NOT NULL, -- 1-4
    description TEXT,
    
    -- Profile characteristics
    profile_general TEXT,
    key_skills TEXT[],
    knowledge_scope TEXT, -- 'Basic', 'Restricted portfolio', 'Large portfolio', 'Complete mastery'
    
    -- KPIs
    structure_compliance_percent INT DEFAULT 90,
    average_score DECIMAL(5,2) DEFAULT 7.0,
    engagement_rate_percent INT DEFAULT 50,
    objection_handling_percent INT DEFAULT 70,
    crm_completeness_percent INT DEFAULT 80,
    profile_adaptation_percent INT DEFAULT 80,
    follow_up_quality_percent INT DEFAULT 70,
    coaching_quality_score DECIMAL(5,2) DEFAULT 8.0,
    
    -- Progression requirements
    progression_threshold_score DECIMAL(5,2) DEFAULT 7.0,
    progression_sessions_required INT DEFAULT 5,
    progression_kpis_required JSONB DEFAULT '{}',
    
    -- Features
    can_handle_difficult_visits BOOLEAN DEFAULT false,
    can_act_as_coach BOOLEAN DEFAULT false,
    can_read_studies BOOLEAN DEFAULT false,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert competency level definitions
INSERT INTO competency_levels (level_code, level_name_fr, level_name_en, level_number, description, profile_general, key_skills, knowledge_scope, structure_compliance_percent, average_score, engagement_rate_percent, objection_handling_percent, crm_completeness_percent, profile_adaptation_percent, follow_up_quality_percent, coaching_quality_score, progression_threshold_score, progression_sessions_required, can_handle_difficult_visits, can_act_as_coach, can_read_studies) VALUES
('BEGINNER', 'Débutant', 'Beginner', 1, 
 'Conducts short, polite, and structured visits but remains scripted with minimal adaptation. Follows 6-step process mechanically.',
 'Handles 1-2 basic questions, treats one standard objection with prepared response, achieves simple micro-commitments. CRM output is minimal.',
 ARRAY['Basic product knowledge', '1-2 basic questions', 'Standard objection handling', 'Simple micro-commitments', 'Basic CRM documentation'],
 'Basic product knowledge (names, indications, 2 key benefits, simple dosage, main precautions). Limited competitive knowledge.',
 90, 7.0, 50, 70, 80, 0, 0, 0, 7.0, 5, false, false, false),

('JUNIOR', 'Junior', 'Junior', 2,
 'More interactive, questioning better, listening actively, and slightly adapting discourse based on physician profile. Master 3 visit formats.',
 'Poses 2-4 relevant questions with follow-ups, uses active listening (silence, reformulation), handles 2 frequent objections via A-C-R-V method. Detects 2 BIP signals.',
 ARRAY['Active questioning', 'Active listening', 'A-C-R-V objection handling', 'BIP signal detection', '3 visit formats (Flash, Standard, Approfondie)', '2-4 relevant questions'],
 'Complete product knowledge on restricted portfolio (5-10 priority products). Simplified composition/mechanism, target vs non-target profiles, practical adherence advice.',
 85, 7.0, 60, 70, 80, 60, 60, 0, 8.0, 5, false, false, true),

('CONFIRMED', 'Confirmé', 'Confirmed', 3,
 'Autonomous medical representative who personalizes strongly, handles pressure, and conducts real-life visits with interruptions and varied objections.',
 'Manages 3 varied objections and differentiates between misunderstandings, prejudices, value objections, and test objections. Segmented argumentation by patient profiles.',
 ARRAY['Profile-based argumentation', '3 varied objection types', 'Relational styles (Analysant, Contrôlant, Facilitant, Promouvant)', 'SONCAS motivators', 'Interrupted visit handling', 'Follow-up management'],
 'Large portfolio (15-30 references) with precise mechanism/composition. Mastered tolerance/contraindications/precautions. Messages tailored by specialty (GP, pediatrician, ENT).',
 80, 8.0, 70, 80, 80, 80, 70, 0, 8.0, 10, false, false, true),

('EXPERT', 'Expert', 'Expert', 4,
 'Top performer who transforms visits into clinical value and lasting relationships. Acts as coach for medical representatives and reference for physicians.',
 'Instantaneous relational diagnosis with strategic conduct. High-precision argumentation covering patient benefit, position in care strategy, clearly stated limits. Teaching capacity.',
 ARRAY['Relational diagnosis', 'Strategic conduct', 'High-precision argumentation', 'Teaching capacity', 'Long cycle orchestration (initiation → test → return → optimization → loyalty)', 'Difficult visit management'],
 'Complete portfolio mastery with cross-product expertise. Can compare levels of evidence, summarize methodology simply, cite references. Transversal knowledge (adherence, physician-patient communication, risk management).',
 75, 9.0, 80, 90, 90, 95, 80, 8.0, 9.0, 10, true, true, true)
ON CONFLICT (level_code) DO NOTHING;

-- =====================================================
-- COMPETENCY LEVEL PROGRESSION RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS level_progression_rules (
    id SERIAL PRIMARY KEY,
    from_level_code TEXT NOT NULL,
    to_level_code TEXT NOT NULL,
    required_score DECIMAL(5,2) NOT NULL,
    required_sessions INT NOT NULL,
    required_kpis JSONB DEFAULT '{}',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint to make ON CONFLICT explicit and idempotent
ALTER TABLE level_progression_rules
    ADD CONSTRAINT IF NOT EXISTS uq_level_progression_rules_pair
    UNIQUE (from_level_code, to_level_code);

-- Insert progression rules
INSERT INTO level_progression_rules (from_level_code, to_level_code, required_score, required_sessions, required_kpis, description) VALUES
('BEGINNER', 'JUNIOR', 7.0, 5, 
 '{"structure_compliance": 0.8, "engagement_rate": 0.6}',
 'Score 7/10 across 5 simulations with 80% structure compliance and 60% engagement rate'),

('JUNIOR', 'CONFIRMED', 8.0, 10,
 '{"objection_handling": 0.7, "crm_completeness": 0.8, "profile_adaptation": 0.8}',
 'Score 8/10 across 10 simulations with 70% A-C-R-V validated objections and 80% complete CRM'),

('CONFIRMED', 'EXPERT', 9.0, 10,
 '{"success_rate_difficult_visits": 0.7, "clean_language": 0.95, "follow_up_quality": 0.8}',
 'Score 9/10 across 10 difficult simulations with 70% success in difficult visits and 95% clean language without overpromises')
ON CONFLICT (from_level_code, to_level_code) DO NOTHING;

-- =====================================================
-- UPDATE rep_profiles TO INCLUDE COMPETENCY LEVEL
-- =====================================================

ALTER TABLE rep_profiles 
ADD COLUMN IF NOT EXISTS competency_level_code TEXT DEFAULT 'BEGINNER',
ADD COLUMN IF NOT EXISTS competency_level_number INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS level_progress_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS level_progress_reason TEXT;

-- Create index for fast level lookups
CREATE INDEX IF NOT EXISTS idx_rep_profiles_competency_level ON rep_profiles(competency_level_code);
CREATE INDEX IF NOT EXISTS idx_rep_profiles_competency_number ON rep_profiles(competency_level_number);

-- =====================================================
-- LEVEL-BASED TRAINING SCENARIOS
-- =====================================================

CREATE TABLE IF NOT EXISTS level_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_code TEXT NOT NULL REFERENCES competency_levels(level_code),
    scenario_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    scenario_type TEXT, -- 'introductory', 'practice', 'advanced', 'difficult'
    visit_format TEXT, -- 'flash', 'standard', 'approfondie'
    doctor_persona JSONB DEFAULT '{}',
    expected_difficulty INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_level_scenarios_level ON level_scenarios(level_code);

-- =====================================================
-- LEVEL PERFORMANCE HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS level_performance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rep_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    level_code TEXT NOT NULL REFERENCES competency_levels(level_code),
    score DECIMAL(5,2) NOT NULL,
    structure_compliance DECIMAL(5,2),
    engagement_rate DECIMAL(5,2),
    objection_handling DECIMAL(5,2),
    crm_completeness DECIMAL(5,2),
    profile_adaptation DECIMAL(5,2),
    follow_up_quality DECIMAL(5,2),
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_level_performance_rep_id ON level_performance_history(rep_id);
CREATE INDEX IF NOT EXISTS idx_level_performance_session ON level_performance_history(session_id);
CREATE INDEX IF NOT EXISTS idx_level_performance_level ON level_performance_history(level_code);

-- =====================================================
-- LEVEL-BASED RECOMMENDATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS level_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rep_id TEXT NOT NULL,
    current_level_code TEXT NOT NULL REFERENCES competency_levels(level_code),
    recommended_level_code TEXT NOT NULL REFERENCES competency_levels(level_code),
    recommendation_reason TEXT,
    focus_areas TEXT[],
    next_steps TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_level_recommendations_rep_id ON level_recommendations(rep_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to determine next competency level based on performance
CREATE OR REPLACE FUNCTION determine_next_level(
    p_rep_id TEXT,
    p_score DECIMAL,
    p_structure_compliance DECIMAL,
    p_engagement_rate DECIMAL,
    p_objection_handling DECIMAL,
    p_crm_completeness DECIMAL,
    p_profile_adaptation DECIMAL
)
RETURNS TABLE (
    current_level_code TEXT,
    current_level_number INT,
    next_level_code TEXT,
    next_level_number INT,
    can_progress BOOLEAN,
    reason TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_level_code TEXT;
    v_current_level_number INT;
    v_current_record RECORD;
    v_next_level_code TEXT;
    v_next_level_number INT;
    v_next_record RECORD;
    v_can_progress BOOLEAN := false;
    v_reason TEXT;
BEGIN
    -- Get current level
    SELECT competency_level_code, competency_level_number
    INTO v_current_level_code, v_current_level_number
    FROM rep_profiles
    WHERE rep_id = p_rep_id;
    
    -- If no level found, start at BEGINNER
    IF v_current_level_code IS NULL THEN
        v_current_level_code := 'BEGINNER';
        v_current_level_number := 1;
    END IF;
    
    -- Determine next level based on current level
    CASE v_current_level_number
        WHEN 1 THEN
            v_next_level_code := 'JUNIOR';
            v_next_level_number := 2;
        WHEN 2 THEN
            v_next_level_code := 'CONFIRMED';
            v_next_level_number := 3;
        WHEN 3 THEN
            v_next_level_code := 'EXPERT';
            v_next_level_number := 4;
        ELSE
            -- Already at EXPERT
            v_next_level_code := v_current_level_code;
            v_next_level_number := v_current_level_number;
    END CASE;
    
    -- Get next level requirements
    SELECT * INTO v_next_record
    FROM competency_levels
    WHERE level_code = v_next_level_code;
    
    -- Check if progression criteria are met
    v_can_progress := (
        p_score >= v_next_record.progression_threshold_score AND
        p_structure_compliance >= (v_next_record.structure_compliance_percent / 100.0) AND
        p_engagement_rate >= (v_next_record.engagement_rate_percent / 100.0)
    );
    
    -- Build reason
    IF v_can_progress THEN
        v_reason := 'Performance criteria met for progression to ' || v_next_record.level_name_fr;
    ELSE
        v_reason := 'Score ' || p_score || '/10. Requires ' || v_next_record.progression_threshold_score || '/10 and higher compliance rates';
    END IF;
    
    RETURN QUERY
    SELECT 
        v_current_level_code,
        v_current_level_number,
        v_next_level_code,
        v_next_level_number,
        v_can_progress,
        v_reason;
END;
$$;

-- =====================================================
-- TRIGGER TO AUTOMATICALLY UPDATE LEVEL
-- =====================================================

CREATE OR REPLACE FUNCTION update_rep_level_on_session_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_metrics RECORD;   -- episode_memories row (score, compliance, etc.)
    v_level   RECORD;   -- determine_next_level result row
BEGIN
    -- Only process if session is completed
    IF NEW.session_status = 'completed' THEN
        -- Get session metrics
        SELECT 
            em.accuracy as score,
            em.compliance as structure_compliance,
            em.confidence as engagement_rate,
            em.clarity as profile_adaptation
        INTO v_metrics
        FROM episode_memories em
        WHERE em.session_id = NEW.session_id
        ORDER BY em.session_date DESC
        LIMIT 1;
        
        -- If we have metrics, determine next level
        IF v_metrics.score IS NOT NULL THEN
            -- Call the level determination function
            FOR v_level IN 
                SELECT 
                    current_level_code,
                    current_level_number,
                    next_level_code,
                    next_level_number,
                    can_progress,
                    reason
                FROM determine_next_level(
                    NEW.rep_id,
                    v_metrics.score,
                    v_metrics.structure_compliance,
                    v_metrics.engagement_rate,
                    0, -- objection_handling (placeholder)
                    0, -- crm_completeness (placeholder)
                    v_metrics.profile_adaptation
                )
            LOOP
                -- Update rep profile if progression is possible
                IF v_level.can_progress THEN
                    UPDATE rep_profiles
                    SET 
                        competency_level_code = v_level.next_level_code,
                        competency_level_number = v_level.next_level_number,
                        level_progress_timestamp = NOW(),
                        level_progress_reason = v_level.reason,
                        updated_at = NOW()
                    WHERE rep_id = NEW.rep_id;
                    
                    -- Log to performance history
                    INSERT INTO level_performance_history (
                        rep_id,
                        session_id,
                        level_code,
                        score,
                        structure_compliance,
                        engagement_rate,
                        objection_handling,
                        crm_completeness,
                        profile_adaptation,
                        follow_up_quality
                    ) VALUES (
                        NEW.rep_id,
                        NEW.session_id,
                        v_level.current_level_code,
                        v_metrics.score,
                        v_metrics.structure_compliance,
                        v_metrics.engagement_rate,
                        0, 0, v_metrics.profile_adaptation, 0
                    );
                    
                    RAISE NOTICE 'Rep % progressed from % to %', NEW.rep_id, v_level.current_level_code, v_level.next_level_code;
                END IF;
            END LOOP;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger on session completion
DROP TRIGGER IF EXISTS trigger_update_level_on_completion ON training_sessions;
CREATE TRIGGER trigger_update_level_on_completion
AFTER UPDATE ON training_sessions
FOR EACH ROW
WHEN (NEW.session_status = 'completed')
EXECUTE FUNCTION update_rep_level_on_session_completion();

-- =====================================================
-- UPDATE EXISTING REPS TO BEGINNER LEVEL
-- =====================================================

UPDATE rep_profiles
SET 
    competency_level_code = 'BEGINNER',
    competency_level_number = 1,
    level_progress_timestamp = NOW(),
    level_progress_reason = 'Initial level assignment',
    updated_at = NOW()
WHERE competency_level_code IS NULL;

-- =====================================================
-- ADD CONSTRAINTS
-- =====================================================

ALTER TABLE rep_profiles
ADD CONSTRAINT chk_competency_level_code 
    CHECK (competency_level_code IN ('BEGINNER', 'JUNIOR', 'CONFIRMED', 'EXPERT'));

ALTER TABLE rep_profiles
ADD CONSTRAINT chk_competency_level_number 
    CHECK (competency_level_number BETWEEN 1 AND 4);
