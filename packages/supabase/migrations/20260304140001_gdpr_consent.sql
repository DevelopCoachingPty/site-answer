-- Add GDPR consent announcement configuration to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS gdpr_announcement_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gdpr_announcement_text TEXT DEFAULT 'This call may be recorded for quality and training purposes.';
