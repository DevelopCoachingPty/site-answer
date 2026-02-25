-- Warm Transfer via Twilio Conference
-- Adds support for live call transfers from AI agent to builder

-- Add warm transfer toggle to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS warm_transfer_enabled BOOLEAN DEFAULT false;

-- Add warm transfer tracking fields to calls
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS warm_transfer_status TEXT,
  ADD COLUMN IF NOT EXISTS conference_room_name TEXT,
  ADD COLUMN IF NOT EXISTS builder_call_sid TEXT;

-- Add CHECK constraint for warm_transfer_status values
ALTER TABLE calls
  ADD CONSTRAINT calls_warm_transfer_status_check
  CHECK (warm_transfer_status IS NULL OR warm_transfer_status IN (
    'pending', 'caller_in_conference', 'builder_ringing',
    'builder_joined', 'builder_no_answer', 'completed', 'failed'
  ));

-- Extend call_actions action_type to include warm_transfer
ALTER TABLE call_actions
  DROP CONSTRAINT IF EXISTS call_actions_action_type_check;

ALTER TABLE call_actions
  ADD CONSTRAINT call_actions_action_type_check
  CHECK (action_type IN (
    'create_contact', 'update_contact', 'book_appointment',
    'send_sms', 'send_email', 'create_task', 'log_note',
    'escalate', 'warm_transfer'
  ));

-- Partial indexes for webhook lookups
CREATE INDEX IF NOT EXISTS idx_calls_conference_room
  ON calls(conference_room_name)
  WHERE conference_room_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_builder_call_sid
  ON calls(builder_call_sid)
  WHERE builder_call_sid IS NOT NULL;
