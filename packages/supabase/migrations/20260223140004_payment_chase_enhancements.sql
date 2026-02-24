-- ============================================================
-- Payment Chase Queue Enhancements
-- Add indexes, bidirectional call linkage, due_date column
-- ============================================================

-- Performance indexes for chase scheduling
CREATE INDEX IF NOT EXISTS idx_payment_chase_org ON payment_chase_queue(organisation_id);
CREATE INDEX IF NOT EXISTS idx_payment_chase_status ON payment_chase_queue(status);
CREATE INDEX IF NOT EXISTS idx_payment_chase_next ON payment_chase_queue(next_chase_at)
    WHERE status IN ('pending', 'promised');

-- Due date for the invoice (separate from days_overdue which is calculated)
ALTER TABLE payment_chase_queue
    ADD COLUMN IF NOT EXISTS due_date DATE;

-- Link chase item to its most recent outbound call
ALTER TABLE payment_chase_queue
    ADD COLUMN IF NOT EXISTS last_call_id UUID REFERENCES calls(id);

-- External invoice reference for accounting integration (Sprint 10)
ALTER TABLE payment_chase_queue
    ADD COLUMN IF NOT EXISTS external_invoice_id TEXT,
    ADD COLUMN IF NOT EXISTS accounting_provider TEXT;

CREATE INDEX IF NOT EXISTS idx_chase_external_invoice
    ON payment_chase_queue(external_invoice_id)
    WHERE external_invoice_id IS NOT NULL;

-- Link outbound calls back to their chase queue item
ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS chase_queue_id UUID REFERENCES payment_chase_queue(id);

CREATE INDEX IF NOT EXISTS idx_calls_chase ON calls(chase_queue_id)
    WHERE chase_queue_id IS NOT NULL;

-- RLS policy for payment_chase_queue
ALTER TABLE payment_chase_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own org chase items"
    ON payment_chase_queue FOR SELECT
    USING (organisation_id = get_user_org_id());

CREATE POLICY "Members can manage own org chase items"
    ON payment_chase_queue FOR ALL
    USING (organisation_id = get_user_org_id());

CREATE POLICY "Admins can view all chase items"
    ON payment_chase_queue FOR SELECT
    USING (is_platform_admin());

-- Updated_at trigger (skip if already created in initial schema)
DROP TRIGGER IF EXISTS set_updated_at ON payment_chase_queue;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_chase_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
