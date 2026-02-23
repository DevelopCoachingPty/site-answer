-- SiteAnswer Initial Schema
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ORGANISATIONS
-- The builder's business account (one per coaching member)
-- ============================================================
CREATE TABLE organisations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id),

    -- ElevenLabs config
    elevenlabs_agent_id TEXT,
    elevenlabs_voice_id TEXT,

    -- GHL config (encrypted OAuth tokens)
    ghl_location_id TEXT,
    ghl_access_token_encrypted TEXT,
    ghl_refresh_token_encrypted TEXT,
    ghl_token_expires_at TIMESTAMPTZ,

    -- Phone config
    phone_number TEXT,
    phone_number_sid TEXT,

    -- Business config
    business_type TEXT DEFAULT 'construction',
    timezone TEXT DEFAULT 'Europe/London',
    business_hours JSONB DEFAULT '{
        "mon": {"start": "08:00", "end": "17:00"},
        "tue": {"start": "08:00", "end": "17:00"},
        "wed": {"start": "08:00", "end": "17:00"},
        "thu": {"start": "08:00", "end": "17:00"},
        "fri": {"start": "08:00", "end": "16:00"},
        "sat": null,
        "sun": null
    }'::jsonb,
    after_hours_action TEXT DEFAULT 'voicemail',

    -- Personalisation
    greeting_name TEXT,
    builder_name TEXT,
    escalation_phone TEXT,
    escalation_sms BOOLEAN DEFAULT true,

    -- Calendar
    calendar_type TEXT,
    calendar_credentials_encrypted TEXT,

    -- Accounting (Phase 2)
    accounting_type TEXT,
    accounting_credentials_encrypted TEXT,

    -- Limits and billing
    monthly_minutes_limit INTEGER DEFAULT 1500,
    is_active BOOLEAN DEFAULT true,
    activated_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    full_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- KNOWLEDGE BASE
-- Company-specific information the AI uses to answer questions
-- ============================================================
CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN (
        'services', 'pricing', 'faq', 'process', 'team', 'area_coverage', 'policies'
    )),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONVERSATION SCRIPTS
-- Configurable conversation flows and prompts
-- ============================================================
CREATE TABLE conversation_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    flow_type TEXT NOT NULL CHECK (flow_type IN (
        'new_inquiry', 'existing_client', 'payment_query',
        'after_hours', 'supplier_subcontractor', 'unknown'
    )),
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    first_message TEXT,
    tool_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organisation_id, flow_type, version)
);

-- ============================================================
-- CALLS
-- Every call that SiteAnswer handles
-- ============================================================
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

    -- Call metadata
    external_call_id TEXT,
    elevenlabs_conversation_id TEXT,
    direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
    status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN (
        'ringing', 'in_progress', 'completed', 'failed', 'missed', 'voicemail'
    )),
    flow_type TEXT DEFAULT 'unknown' CHECK (flow_type IN (
        'new_inquiry', 'existing_client', 'payment_query',
        'after_hours', 'supplier_subcontractor', 'unknown'
    )),

    -- Parties
    caller_number TEXT,
    called_number TEXT,
    caller_name TEXT,

    -- GHL link
    ghl_contact_id TEXT,
    is_new_contact BOOLEAN DEFAULT false,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Content
    transcript JSONB,
    summary TEXT,
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    recording_url TEXT,

    -- Escalation
    escalation_reason TEXT,
    escalated_at TIMESTAMPTZ,
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date DATE,
    follow_up_notes TEXT,

    -- Cost tracking
    elevenlabs_cost_cents INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CALL ACTIONS
-- Discrete actions taken during or after a call
-- ============================================================
CREATE TABLE call_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

    action_type TEXT NOT NULL CHECK (action_type IN (
        'create_contact', 'update_contact', 'book_appointment',
        'send_sms', 'send_email', 'create_task', 'log_note', 'escalate'
    )),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'skipped')),

    payload JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    error_message TEXT,

    attempted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENT CHASE QUEUE (Phase 2)
-- ============================================================
CREATE TABLE payment_chase_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    ghl_contact_id TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    invoice_reference TEXT,
    amount_due DECIMAL(10,2),
    days_overdue INTEGER,
    chase_count INTEGER DEFAULT 0,
    max_chases INTEGER DEFAULT 3,
    last_chase_at TIMESTAMPTZ,
    next_chase_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'promised', 'paid', 'disputed', 'escalated'
    )),
    promise_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USAGE TRACKING
-- Track costs per organisation for monitoring and alerts
-- ============================================================
CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_calls INTEGER DEFAULT 0,
    total_minutes DECIMAL(10,2) DEFAULT 0,
    total_characters INTEGER DEFAULT 0,
    inbound_calls INTEGER DEFAULT 0,
    outbound_calls INTEGER DEFAULT 0,
    missed_calls INTEGER DEFAULT 0,
    new_contacts_created INTEGER DEFAULT 0,
    appointments_booked INTEGER DEFAULT 0,
    sms_sent INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organisation_id, period_start)
);

-- ============================================================
-- WEBHOOK EVENTS (for idempotency and debugging)
-- ============================================================
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source, event_id)
);

-- ============================================================
-- NOTIFICATIONS (in-app alerts)
-- ============================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_calls_org_id ON calls(organisation_id);
CREATE INDEX idx_calls_started_at ON calls(started_at DESC);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_ghl_contact ON calls(ghl_contact_id);
CREATE INDEX idx_calls_external_id ON calls(external_call_id);
CREATE INDEX idx_calls_caller_number ON calls(caller_number);
CREATE INDEX idx_call_actions_call_id ON call_actions(call_id);
CREATE INDEX idx_call_actions_status ON call_actions(status);
CREATE INDEX idx_knowledge_base_org ON knowledge_base(organisation_id);
CREATE INDEX idx_knowledge_base_category ON knowledge_base(organisation_id, category);
CREATE INDEX idx_usage_org_period ON usage_tracking(organisation_id, period_start);
CREATE INDEX idx_webhook_events_idempotency ON webhook_events(source, event_id);
CREATE INDEX idx_users_org ON users(organisation_id);
CREATE INDEX idx_notifications_org ON notifications(organisation_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_organisations_phone ON organisations(phone_number);
CREATE INDEX idx_organisations_ghl ON organisations(ghl_location_id);
CREATE INDEX idx_organisations_agent ON organisations(elevenlabs_agent_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organisations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversation_scripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON usage_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_chase_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
