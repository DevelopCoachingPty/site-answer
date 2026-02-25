import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { ExternalServiceError } from "../../lib/errors.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import * as kbService from "../knowledge-base/kb.service.js";
import * as scriptsService from "../scripts/scripts.service.js";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function getHeaders() {
  return {
    "xi-api-key": env.ELEVENLABS_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

async function elFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ path, status: response.status, body }, "ElevenLabs API error");
    throw new ExternalServiceError("ElevenLabs", `API call failed (${response.status}): ${body}`);
  }

  return response;
}

// --- Agent Management ---

export async function createAgent(orgId: string, orgName: string): Promise<string> {
  const systemPrompt = await buildSystemPrompt(orgId);
  const toolFunctionBaseUrl = `${env.API_BASE_URL}/api/v1/webhooks/elevenlabs`;

  const response = await elFetch("/convai/agents/create", {
    method: "POST",
    body: JSON.stringify({
      name: `SiteAnswer - ${orgName}`,
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
          first_message: `Good morning, you've reached ${orgName}, how can I help you today?`,
          language: "en",
        },
        asr: {
          quality: "high",
          provider: "elevenlabs",
          model: "scribe_v2",
        },
        tts: {
          model_id: "eleven_turbo_v2_5",
          voice_id: env.ELEVENLABS_DEFAULT_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
          optimize_streaming_latency: 3,
        },
        turn: {
          mode: "turn_based",
        },
      },
      platform_settings: {
        tools: buildToolConfigs(toolFunctionBaseUrl),
      },
    }),
  });

  const data = await response.json() as { agent_id: string };
  return data.agent_id;
}

export async function updateAgentPrompt(agentId: string, orgId: string): Promise<void> {
  const systemPrompt = await buildSystemPrompt(orgId);

  await elFetch(`/convai/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
        },
      },
    }),
  });
}

export async function deleteAgent(agentId: string): Promise<void> {
  await elFetch(`/convai/agents/${agentId}`, { method: "DELETE" });
}

export async function getAgent(agentId: string) {
  const response = await elFetch(`/convai/agents/${agentId}`);
  return response.json();
}

// --- Prompt Builder ---

export async function buildSystemPrompt(orgId: string): Promise<string> {
  // Get organisation details
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("name, builder_name, greeting_name, phone_number, timezone, business_hours, escalation_phone, escalation_sms")
    .eq("id", orgId)
    .single();

  if (!org) {
    throw new Error(`Organisation ${orgId} not found`);
  }

  // Get active knowledge base entries
  const kbEntries = await kbService.getActiveKnowledgeBase(orgId);

  // Get active scripts
  const scripts = await scriptsService.listScripts(orgId);

  // Build knowledge base section
  const kbSections = kbEntries.reduce(
    (acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category]!.push(`### ${entry.title}\n${entry.content}`);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  const kbText = Object.entries(kbSections)
    .map(([category, entries]) => `## ${category.toUpperCase()}\n${entries.join("\n\n")}`)
    .join("\n\n");

  // Build script references
  const scriptRefs = scripts
    .map((s) => `- **${s.name}** (${s.flow_type}): ${s.system_prompt.slice(0, 100)}...`)
    .join("\n");

  return `You are a professional office manager AI answering calls for ${org.name}.
Builder: ${org.builder_name ?? "the owner"}
${org.greeting_name ? `Refer to the business as: ${org.greeting_name}` : ""}
Phone: ${org.phone_number ?? "not set"}
Timezone: ${org.timezone ?? env.DEFAULT_TIMEZONE}
Escalation phone: ${org.escalation_phone ?? "not set"}
${org.escalation_sms ? "Send SMS when escalating." : ""}

---

# KNOWLEDGE BASE
${kbText || "No knowledge base entries yet."}

---

# AVAILABLE CONVERSATION SCRIPTS
${scriptRefs || "Default scripts are in use."}

---

# TOOLS AVAILABLE
You have access to these tools to help callers:
- **lookup_caller**: Look up a caller by phone number in the CRM
- **create_new_contact**: Create a new contact in the CRM
- **check_calendar**: Check available appointment slots
- **book_appointment**: Book an appointment for the caller
- **send_sms**: Send an SMS message (e.g., confirmation, summary to builder)
- **escalate_to_builder**: Immediately escalate to the builder (urgent/emergency)
- **get_knowledge**: Search the knowledge base for specific information
- **log_message**: Log a message for callback
- **send_whatsapp**: Send a WhatsApp confirmation message to the caller

# EMERGENCY KEYWORDS
If the caller mentions: flood, leak, collapse, fire, structural, dangerous, urgent, emergency, gas, electric
→ Immediately use escalate_to_builder tool with urgency_level "emergency"

# WARM TRANSFER
When you use escalate_to_builder and the response includes "warm_transfer": true,
immediately tell the caller the message provided in the response. Then stop talking
completely — the system will handle the transfer. Do NOT continue the conversation.

# RULES
1. Be warm, professional, and efficient
2. Never make commitments on pricing or timelines
3. Always get caller name and number
4. Use knowledge base to answer questions about the business
5. If unsure, take a message and offer a callback
6. Log all important information for the builder`;
}

// --- Tool Configs ---

function buildToolConfigs(baseUrl: string) {
  return [
    {
      type: "webhook",
      name: "lookup_caller",
      description: "Look up a caller by phone number in the CRM to get their details and history",
      webhook: { url: `${baseUrl}/tools/lookup_caller`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "The caller's phone number" },
        },
        required: ["phone_number"],
      },
    },
    {
      type: "webhook",
      name: "create_new_contact",
      description: "Create a new contact in the CRM for a first-time caller",
      webhook: { url: `${baseUrl}/tools/create_new_contact`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full name of the caller" },
          phone: { type: "string", description: "Phone number" },
          email: { type: "string", description: "Email address" },
          address: { type: "string", description: "Address" },
          inquiry_type: { type: "string", description: "Type of inquiry (e.g., renovation, new build)" },
          notes: { type: "string", description: "Additional notes about the inquiry" },
        },
        required: ["name", "phone"],
      },
    },
    {
      type: "webhook",
      name: "check_calendar",
      description: "Check available appointment slots in the builder's calendar",
      webhook: { url: `${baseUrl}/tools/check_calendar`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          date_range: { type: "string", description: "Date range to check (e.g., 'next week', 'Monday')" },
          duration: { type: "integer", description: "Appointment duration in minutes" },
        },
      },
    },
    {
      type: "webhook",
      name: "book_appointment",
      description: "Book an appointment for the caller",
      webhook: { url: `${baseUrl}/tools/book_appointment`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "CRM contact ID" },
          datetime: { type: "string", description: "Appointment date/time" },
          type: { type: "string", description: "Appointment type (site_visit, phone_callback, consultation)" },
          notes: { type: "string", description: "Notes about the appointment" },
        },
        required: ["datetime", "type"],
      },
    },
    {
      type: "webhook",
      name: "send_sms",
      description: "Send an SMS message to a phone number",
      webhook: { url: `${baseUrl}/tools/send_sms`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Phone number to send SMS to" },
          message: { type: "string", description: "SMS message content" },
        },
        required: ["phone_number", "message"],
      },
    },
    {
      type: "webhook",
      name: "escalate_to_builder",
      description: "Immediately escalate the call to the builder. May connect the caller directly via live transfer if enabled, otherwise sends an SMS notification.",
      webhook: { url: `${baseUrl}/tools/escalate_to_builder`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Reason for escalation" },
          caller_name: { type: "string", description: "Caller's name" },
          caller_number: { type: "string", description: "Caller's phone number" },
          urgency_level: { type: "string", description: "Urgency level: normal, urgent, emergency" },
        },
        required: ["reason", "caller_number"],
      },
    },
    {
      type: "webhook",
      name: "get_knowledge",
      description: "Search the knowledge base for information about the business",
      webhook: { url: `${baseUrl}/tools/get_knowledge`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for in the knowledge base" },
        },
        required: ["query"],
      },
    },
    {
      type: "webhook",
      name: "log_message",
      description: "Log a message for the builder to follow up on",
      webhook: { url: `${baseUrl}/tools/log_message`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string", description: "Caller's name" },
          phone: { type: "string", description: "Caller's phone number" },
          message: { type: "string", description: "Message content" },
          callback_requested: { type: "boolean", description: "Whether the caller requested a callback" },
        },
        required: ["caller_name", "phone", "message"],
      },
    },
    {
      type: "webhook",
      name: "send_whatsapp",
      description: "Send a WhatsApp confirmation message to the caller (booking confirmation, inquiry summary, etc.)",
      webhook: { url: `${baseUrl}/tools/send_whatsapp`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Phone number to send WhatsApp to" },
          template_type: { type: "string", description: "Template type: booking_confirmation, inquiry_summary, payment_reminder" },
          contact_name: { type: "string", description: "Contact's name" },
          datetime: { type: "string", description: "Appointment date/time if booking" },
          notes: { type: "string", description: "Additional notes" },
        },
        required: ["phone_number", "template_type"],
      },
    },
    {
      type: "webhook",
      name: "record_payment_outcome",
      description: "Record the outcome of a payment chase call (paid, promised, disputed)",
      webhook: { url: `${baseUrl}/tools/record_payment_outcome`, method: "POST" },
      parameters: {
        type: "object",
        properties: {
          chase_item_id: { type: "string", description: "The chase queue item ID" },
          outcome: { type: "string", description: "Payment outcome: paid, promised, or disputed" },
          promise_date: { type: "string", description: "Date payment was promised for (YYYY-MM-DD)" },
          notes: { type: "string", description: "Additional notes about the conversation" },
        },
        required: ["chase_item_id", "outcome"],
      },
    },
  ];
}

// --- Outbound Calls ---

export function buildPaymentChasePrompt(input: {
  contactName: string;
  invoiceReference?: string;
  amountDue?: number;
  daysOverdue?: number;
  chaseCount: number;
}) {
  const urgency = input.chaseCount === 0
    ? "polite first reminder"
    : input.chaseCount === 1
      ? "friendly follow-up"
      : "firm but professional final reminder";

  return `You are calling ${input.contactName} regarding an outstanding invoice.
Invoice: ${input.invoiceReference ?? "on file"}
Amount due: ${input.amountDue ? `$${input.amountDue.toFixed(2)}` : "as discussed"}
${input.daysOverdue ? `Days overdue: ${input.daysOverdue}` : ""}
Tone: ${urgency} (chase attempt #${input.chaseCount + 1})

GOALS:
1. Confirm you are speaking with ${input.contactName}
2. Politely remind them of the outstanding payment
3. Ask when they expect to make payment
4. If they commit to a date, use the record_payment_outcome tool with outcome "promised"
5. If they confirm payment was made, use record_payment_outcome with outcome "paid"
6. If they dispute the invoice, use record_payment_outcome with outcome "disputed"
7. Be professional and empathetic - maintain a good business relationship
8. Thank them for their time`;
}

export async function initiateOutboundCall(orgId: string, input: {
  phoneNumber: string;
  contactName: string;
  invoiceReference?: string;
  amountDue?: number;
  daysOverdue?: number;
  chaseCount: number;
  callId: string;
  chaseItemId: string;
}) {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("elevenlabs_agent_id, phone_number")
    .eq("id", orgId)
    .single();

  if (!org?.elevenlabs_agent_id) {
    throw new ExternalServiceError("ElevenLabs", "No agent provisioned for this organisation");
  }

  const prompt = buildPaymentChasePrompt(input);

  const response = await elFetch("/convai/conversations/create-call", {
    method: "POST",
    body: JSON.stringify({
      agent_id: org.elevenlabs_agent_id,
      agent_overrides: {
        agent: {
          prompt: { prompt },
          first_message: `Hello, may I speak with ${input.contactName} please?`,
        },
      },
      to: input.phoneNumber,
      from: org.phone_number ?? env.TWILIO_PHONE_NUMBER,
      metadata: {
        call_id: input.callId,
        chase_item_id: input.chaseItemId,
        organisation_id: orgId,
      },
    }),
  });

  const data = await response.json() as { conversation_id: string };
  logger.info({ conversationId: data.conversation_id, orgId }, "Outbound chase call initiated");
  return data;
}

// --- Test Call ---

export async function createTestCall(agentId: string, input: {
  toNumber: string;
  fromNumber: string;
  orgName: string;
}): Promise<{ conversation_id: string }> {
  const response = await elFetch("/convai/conversations/create-call", {
    method: "POST",
    body: JSON.stringify({
      agent_id: agentId,
      agent_overrides: {
        agent: {
          first_message: `Hello, this is a test call from ${input.orgName}'s AI assistant. Everything is working correctly. Have a great day!`,
        },
      },
      to: input.toNumber,
      from: input.fromNumber,
    }),
  });

  const data = await response.json() as { conversation_id: string };
  logger.info({ conversationId: data.conversation_id, agentId }, "Test call initiated");
  return data;
}

// --- Provisioning ---

export async function provisionAgent(orgId: string): Promise<string> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("name, elevenlabs_agent_id")
    .eq("id", orgId)
    .single();

  if (!org) throw new Error(`Organisation ${orgId} not found`);

  // If agent already exists, just update the prompt
  if (org.elevenlabs_agent_id) {
    await updateAgentPrompt(org.elevenlabs_agent_id, orgId);
    return org.elevenlabs_agent_id;
  }

  // Create new agent
  const agentId = await createAgent(orgId, org.name);

  // Store agent ID
  await supabaseAdmin
    .from("organisations")
    .update({ elevenlabs_agent_id: agentId })
    .eq("id", orgId);

  logger.info({ orgId, agentId }, "ElevenLabs agent provisioned");
  return agentId;
}
