-- ============================================================
-- Analytics & Script Versioning
-- ============================================================

-- Script versioning enhancements
ALTER TABLE conversation_scripts
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS change_notes TEXT;

-- Pre-computed daily call stats for analytics
CREATE TABLE call_daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    total_calls INTEGER DEFAULT 0,
    inbound_calls INTEGER DEFAULT 0,
    outbound_calls INTEGER DEFAULT 0,
    missed_calls INTEGER DEFAULT 0,
    completed_calls INTEGER DEFAULT 0,
    avg_duration_seconds INTEGER DEFAULT 0,
    positive_sentiment INTEGER DEFAULT 0,
    neutral_sentiment INTEGER DEFAULT 0,
    negative_sentiment INTEGER DEFAULT 0,
    flow_type_counts JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organisation_id, stat_date)
);

CREATE INDEX idx_daily_stats_org_date ON call_daily_stats(organisation_id, stat_date DESC);
