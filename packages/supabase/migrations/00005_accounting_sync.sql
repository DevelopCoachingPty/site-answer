-- ============================================================
-- Accounting Sync (Xero / QuickBooks)
-- Sync log, org token storage, chase queue external refs
-- ============================================================

-- Sync history log
CREATE TABLE accounting_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('xero', 'quickbooks')),
    sync_type TEXT NOT NULL DEFAULT 'overdue_invoices' CHECK (sync_type IN ('overdue_invoices', 'full', 'manual')),
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    invoices_found INTEGER DEFAULT 0,
    invoices_synced INTEGER DEFAULT 0,
    invoices_resolved INTEGER DEFAULT 0,
    error TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounting_sync_org ON accounting_sync_log(organisation_id);
CREATE INDEX idx_accounting_sync_recent ON accounting_sync_log(organisation_id, created_at DESC);

-- Additional org columns for accounting OAuth
ALTER TABLE organisations
    ADD COLUMN IF NOT EXISTS accounting_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS accounting_refresh_token_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS accounting_tenant_id TEXT;

-- RLS for sync log
ALTER TABLE accounting_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own org sync logs"
    ON accounting_sync_log FOR SELECT
    USING (organisation_id = get_user_org_id());

CREATE POLICY "Admins can view all sync logs"
    ON accounting_sync_log FOR SELECT
    USING (is_platform_admin());
