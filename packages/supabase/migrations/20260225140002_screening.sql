-- Call Screening & Gatekeeper Support
-- Adds screening-specific knowledge base categories, call outcome tracking,
-- and expanded action types for the gatekeeper system.

-- 1. Expand knowledge_base category CHECK to include screening categories
ALTER TABLE knowledge_base
  DROP CONSTRAINT IF EXISTS knowledge_base_category_check;

ALTER TABLE knowledge_base
  ADD CONSTRAINT knowledge_base_category_check
  CHECK (category IN (
    'services', 'pricing', 'faq', 'process', 'team', 'area_coverage', 'policies',
    'screening_vip', 'screening_blocked', 'screening_rules'
  ));

-- 2. Add screening_outcome to calls
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS screening_outcome TEXT;

ALTER TABLE calls
  ADD CONSTRAINT calls_screening_outcome_check
  CHECK (screening_outcome IS NULL OR screening_outcome IN (
    'transferred', 'handled', 'callback_booked', 'message_taken',
    'sales_blocked', 'recruiter_blocked', 'vip_transferred'
  ));

-- 3. Expand call_actions action_type to include screening actions
ALTER TABLE call_actions
  DROP CONSTRAINT IF EXISTS call_actions_action_type_check;

ALTER TABLE call_actions
  ADD CONSTRAINT call_actions_action_type_check
  CHECK (action_type IN (
    'create_contact', 'update_contact', 'book_appointment',
    'send_sms', 'send_email', 'create_task', 'log_note',
    'escalate', 'warm_transfer', 'block_sales_call', 'tag_contact',
    'tag_call_outcome'
  ));

-- 4. Index for screening outcome queries
CREATE INDEX IF NOT EXISTS idx_calls_screening_outcome
  ON calls(screening_outcome)
  WHERE screening_outcome IS NOT NULL;
