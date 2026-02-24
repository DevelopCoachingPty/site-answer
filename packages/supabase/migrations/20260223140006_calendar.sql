-- ============================================================
-- Calendar Integration (Google / Outlook)
-- ============================================================

-- Additional org columns for calendar OAuth
ALTER TABLE organisations
    ADD COLUMN IF NOT EXISTS calendar_id TEXT,
    ADD COLUMN IF NOT EXISTS calendar_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS calendar_refresh_token_encrypted TEXT;

-- Appointments table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    call_id UUID REFERENCES calls(id),
    external_event_id TEXT,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'ghl')),
    contact_name TEXT NOT NULL,
    contact_phone TEXT,
    contact_email TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    title TEXT,
    notes TEXT,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_org ON appointments(organisation_id);
CREATE INDEX idx_appointments_call ON appointments(call_id);
CREATE INDEX idx_appointments_time ON appointments(organisation_id, start_time);

-- RLS for appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own org appointments"
    ON appointments FOR SELECT
    USING (organisation_id = get_user_org_id());

CREATE POLICY "Members can manage own org appointments"
    ON appointments FOR ALL
    USING (organisation_id = get_user_org_id());

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
