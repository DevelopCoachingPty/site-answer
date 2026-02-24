import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { getQueue } from "../../lib/queue.js";
import { QUEUE_NAMES } from "../../config/constants.js";
import { logger } from "../../lib/logger.js";

export async function listScripts(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversation_scripts")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("is_active", true)
    .order("flow_type", { ascending: true });

  if (error) {
    throw new AppError(500, `Failed to list scripts: ${error.message}`, "DB_ERROR");
  }

  return data ?? [];
}

export async function getScript(orgId: string, scriptId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversation_scripts")
    .select("*")
    .eq("id", scriptId)
    .eq("organisation_id", orgId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Conversation script", scriptId);
  }

  return data;
}

export async function getActiveScript(orgId: string, flowType: string) {
  const { data } = await supabaseAdmin
    .from("conversation_scripts")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("flow_type", flowType)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function updateScript(
  orgId: string,
  scriptId: string,
  updates: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin
    .from("conversation_scripts")
    .update(updates)
    .eq("id", scriptId)
    .eq("organisation_id", orgId)
    .select()
    .single();

  if (error) {
    throw new NotFoundError("Conversation script", scriptId);
  }

  return data;
}

export async function createScript(orgId: string, input: {
  flow_type: string;
  name: string;
  system_prompt: string;
  first_message?: string;
  tool_config?: Record<string, unknown>;
}) {
  // Get the latest version for this flow type
  const { data: existing } = await supabaseAdmin
    .from("conversation_scripts")
    .select("version")
    .eq("organisation_id", orgId)
    .eq("flow_type", input.flow_type)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (existing?.version ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("conversation_scripts")
    .insert({
      organisation_id: orgId,
      flow_type: input.flow_type,
      name: input.name,
      system_prompt: input.system_prompt,
      first_message: input.first_message,
      tool_config: input.tool_config ?? {},
      version: nextVersion,
    })
    .select()
    .single();

  if (error) {
    throw new AppError(500, `Failed to create script: ${error.message}`, "DB_ERROR");
  }

  return data;
}

export async function getScriptVersionHistory(orgId: string, flowType: string) {
  const { data, error } = await supabaseAdmin
    .from("conversation_scripts")
    .select("id, name, flow_type, version, is_active, published_at, published_by, change_notes, created_at")
    .eq("organisation_id", orgId)
    .eq("flow_type", flowType)
    .order("version", { ascending: false });

  if (error) {
    throw new AppError(500, `Failed to get version history: ${error.message}`, "DB_ERROR");
  }

  return data ?? [];
}

export async function publishScript(orgId: string, scriptId: string, userId: string) {
  // Get the script to publish
  const script = await getScript(orgId, scriptId);

  // Deactivate all other versions of this flow type
  await supabaseAdmin
    .from("conversation_scripts")
    .update({ is_active: false })
    .eq("organisation_id", orgId)
    .eq("flow_type", script.flow_type)
    .neq("id", scriptId);

  // Activate and mark as published
  const { data, error } = await supabaseAdmin
    .from("conversation_scripts")
    .update({
      is_active: true,
      published_at: new Date().toISOString(),
      published_by: userId,
    })
    .eq("id", scriptId)
    .select()
    .single();

  if (error) {
    throw new AppError(500, `Failed to publish script: ${error.message}`, "DB_ERROR");
  }

  // Queue agent sync
  try {
    const queue = getQueue(QUEUE_NAMES.AGENT_SYNC);
    await queue.add("sync", { organisationId: orgId, trigger: "script_published" }, {
      jobId: `agent-sync-${orgId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      delay: 2000,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to queue agent sync after publish");
  }

  return data;
}

export async function previewScript(orgId: string, scriptId: string) {
  const script = await getScript(orgId, scriptId);

  // Import buildSystemPrompt dynamically to avoid circular deps
  const { buildSystemPrompt } = await import("../elevenlabs/elevenlabs.client.js");
  const fullPrompt = await buildSystemPrompt(orgId);

  return {
    script,
    rendered_prompt: fullPrompt,
  };
}

export async function createScriptVersion(orgId: string, input: {
  flow_type: string;
  name: string;
  system_prompt: string;
  first_message?: string;
  change_notes?: string;
}) {
  const script = await createScript(orgId, input);

  // Update change_notes if provided
  if (input.change_notes) {
    await supabaseAdmin
      .from("conversation_scripts")
      .update({ change_notes: input.change_notes })
      .eq("id", script.id);
  }

  return script;
}

const DEFAULT_SCRIPTS = [
  {
    flow_type: "new_inquiry",
    name: "New Inquiry",
    system_prompt: `You are a professional office manager answering calls for a construction business. A potential new client is calling.

Your goals:
1. Greet them warmly and identify what work they need
2. Get their name and contact details
3. Ask qualifying questions: location, timeline, budget range
4. Answer questions about the company using the knowledge base
5. Offer to book a callback or site visit
6. Confirm next steps

Be enthusiastic but professional. Never make unauthorised commitments on pricing or timelines.`,
    first_message: "Good morning, you've reached {company_name}, how can I help you today?",
  },
  {
    flow_type: "existing_client",
    name: "Existing Client",
    system_prompt: `You are a professional office manager answering calls for a construction business. An existing client is calling.

You have their details from the CRM. Be warm and familiar.

Common scenarios:
- Status check: Check project stage, provide update
- Schedule change: Check calendar, offer alternatives
- Complaint: Listen, empathise, escalate to builder
- General question: Check knowledge base, answer or take message

Always reference their name and project when possible.`,
    first_message: "Hi {caller_name}, thanks for calling {company_name}. How can I help?",
  },
  {
    flow_type: "payment_query",
    name: "Payment / Accounts",
    system_prompt: `You are a professional office manager handling a payment or accounts query.

Be professional and calm. Never argue about payments.

Scenarios:
- Invoice query: Reference details, offer to resend
- How to pay: Provide payment options from knowledge base
- Already paid: Log the claim, flag for confirmation
- Dispute: Empathetic tone, never argue, escalate to builder immediately`,
    first_message: "Hello, you've reached {company_name} accounts. How can I help?",
  },
  {
    flow_type: "after_hours",
    name: "After Hours",
    system_prompt: `You are answering calls outside business hours for a construction business.

Take a message and set callback expectations.
Check for emergency keywords: flood, leak, collapse, fire, structural, dangerous, urgent, emergency, gas, electric.

If emergency: Gather critical details and immediately escalate.
If not emergency: Log message, send SMS summary to builder, schedule callback for next business day.`,
    first_message: "Hello, you've reached {company_name}. We're currently outside business hours, but I can help take a message or assist with any urgent matters.",
  },
  {
    flow_type: "supplier_subcontractor",
    name: "Supplier / Subcontractor",
    system_prompt: `You are answering a call from a supplier or subcontractor.

Be efficient and brief.
- Delivery updates: Log and notify builder via SMS
- Schedule checks: Confirm or flag conflicts
- Urgent issues: Escalate to builder immediately`,
    first_message: "Hello, {company_name}, how can I help?",
  },
];

export async function seedDefaultScripts(orgId: string) {
  for (const script of DEFAULT_SCRIPTS) {
    const { data: existing } = await supabaseAdmin
      .from("conversation_scripts")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("flow_type", script.flow_type)
      .limit(1)
      .single();

    if (!existing) {
      await createScript(orgId, script);
    }
  }
}
