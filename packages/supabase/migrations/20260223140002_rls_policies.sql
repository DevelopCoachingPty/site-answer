-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_chase_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get user's organisation_id from JWT
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT organisation_id FROM users
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is platform admin (Develop Coaching staff)
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(
        (SELECT is_admin FROM users WHERE id = auth.uid()),
        false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- POLICIES: ORGANISATIONS
-- ============================================================
CREATE POLICY "Members view own organisation"
    ON organisations FOR SELECT
    USING (id = get_user_org_id() OR is_platform_admin());

CREATE POLICY "Members update own organisation"
    ON organisations FOR UPDATE
    USING (id = get_user_org_id() OR is_platform_admin());

CREATE POLICY "Admins manage all organisations"
    ON organisations FOR ALL
    USING (is_platform_admin());

-- ============================================================
-- POLICIES: USERS
-- ============================================================
CREATE POLICY "Users view own org users"
    ON users FOR SELECT
    USING (organisation_id = get_user_org_id() OR is_platform_admin());

CREATE POLICY "Users update own profile"
    ON users FOR UPDATE
    USING (id = auth.uid() OR is_platform_admin());

-- ============================================================
-- POLICIES: KNOWLEDGE BASE
-- ============================================================
CREATE POLICY "Members manage own knowledge base"
    ON knowledge_base FOR ALL
    USING (organisation_id = get_user_org_id() OR is_platform_admin());

-- ============================================================
-- POLICIES: CONVERSATION SCRIPTS
-- ============================================================
CREATE POLICY "Members manage own scripts"
    ON conversation_scripts FOR ALL
    USING (organisation_id = get_user_org_id() OR is_platform_admin());

-- ============================================================
-- POLICIES: CALLS
-- ============================================================
CREATE POLICY "Members view own calls"
    ON calls FOR SELECT
    USING (organisation_id = get_user_org_id() OR is_platform_admin());

-- Insert/update via service role only (backend processes calls)

-- ============================================================
-- POLICIES: CALL ACTIONS
-- ============================================================
CREATE POLICY "Members view own call actions"
    ON call_actions FOR SELECT
    USING (organisation_id = get_user_org_id() OR is_platform_admin());

-- ============================================================
-- POLICIES: USAGE TRACKING
-- ============================================================
CREATE POLICY "Members view own usage"
    ON usage_tracking FOR SELECT
    USING (organisation_id = get_user_org_id() OR is_platform_admin());

-- ============================================================
-- POLICIES: NOTIFICATIONS
-- ============================================================
CREATE POLICY "Users view own notifications"
    ON notifications FOR SELECT
    USING (
        (organisation_id = get_user_org_id() AND (user_id IS NULL OR user_id = auth.uid()))
        OR is_platform_admin()
    );

CREATE POLICY "Users mark own notifications read"
    ON notifications FOR UPDATE
    USING (
        (organisation_id = get_user_org_id() AND (user_id IS NULL OR user_id = auth.uid()))
        OR is_platform_admin()
    );

-- ============================================================
-- POLICIES: PAYMENT CHASE QUEUE
-- ============================================================
CREATE POLICY "Members view own payment queue"
    ON payment_chase_queue FOR SELECT
    USING (organisation_id = get_user_org_id() OR is_platform_admin());

-- ============================================================
-- POLICIES: WEBHOOK EVENTS
-- Service role only (no user access needed)
-- ============================================================
CREATE POLICY "Admins view webhook events"
    ON webhook_events FOR SELECT
    USING (is_platform_admin());
