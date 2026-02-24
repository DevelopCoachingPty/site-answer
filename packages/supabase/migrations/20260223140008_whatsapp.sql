-- Sprint 13: WhatsApp messaging
-- Templates + message log for post-call WhatsApp confirmations

-- WhatsApp templates
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('booking_confirmation', 'inquiry_summary', 'payment_reminder', 'custom')),
  body_template TEXT NOT NULL,
  twilio_content_sid TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, template_type)
);

-- WhatsApp message log
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id),
  template_id UUID REFERENCES whatsapp_templates(id),
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  twilio_sid TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Org WhatsApp settings
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_org ON whatsapp_templates(organisation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org ON whatsapp_messages(organisation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_call ON whatsapp_messages(call_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(organisation_id, status);

-- Triggers
CREATE TRIGGER set_whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_whatsapp_messages_updated_at
  BEFORE UPDATE ON whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage whatsapp_templates"
  ON whatsapp_templates FOR ALL
  USING (organisation_id = get_user_org_id());

CREATE POLICY "Org members view whatsapp_messages"
  ON whatsapp_messages FOR ALL
  USING (organisation_id = get_user_org_id());
