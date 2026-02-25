/**
 * Screening Service
 *
 * Provides call screening logic for the gatekeeper system.
 * Loads VIP/blocked lists and custom rules from the knowledge base,
 * classifies callers, and detects sales/cold calls.
 */

import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";

// --- Types ---

export interface ScreeningConfig {
  vipCallers: Array<{ title: string; content: string }>;
  blockedCallers: Array<{ title: string; content: string }>;
  customRules: Array<{ title: string; content: string }>;
}

export type CallerClassification =
  | "existing_client_urgent"
  | "existing_client"
  | "new_inquiry"
  | "sales_cold_call"
  | "supplier"
  | "subcontractor"
  | "recruiter"
  | "vip"
  | "blocked"
  | "unknown";

export type ScreeningRecommendation =
  | "transfer_immediately"
  | "transfer_urgent"
  | "handle_or_callback"
  | "qualify_and_callback"
  | "block_politely"
  | "take_message"
  | "handle_query";

export interface ScreeningResult {
  classification: CallerClassification;
  recommendation: ScreeningRecommendation;
  is_vip: boolean;
  is_blocked: boolean;
  vip_note?: string;
  blocked_reason?: string;
}

export interface SalesDetectionResult {
  is_likely_sales: boolean;
  confidence: "high" | "medium" | "low";
  matched_patterns: string[];
}

// --- Sales detection patterns ---

const SALES_PHRASES = [
  "business insurance",
  "help companies like yours",
  "following up on an email",
  "following up on a letter",
  "who handles your",
  "speak to the business owner",
  "speak to the owner",
  "speak to the decision maker",
  "person who handles",
  "courtesy call",
  "been trying to reach you",
  "happy with your current",
  "save you money",
  "just a quick call to introduce",
  "we specialise in",
  "we specialize in",
  "we help businesses",
  "improve your",
  "reduce your costs",
  "free consultation",
  "no obligation",
  "limited time offer",
  "exclusive deal",
];

const SALES_COMPANY_TYPES = [
  "seo",
  "marketing agency",
  "digital marketing",
  "business energy",
  "energy broker",
  "merchant services",
  "card payment",
  "payment processing",
  "insurance broker",
  "telecoms",
  "telecommunications",
  "it support",
  "managed it",
  "accountancy",
  "hr services",
  "employment law",
  "web design",
  "social media",
  "google ads",
  "ppc",
  "recruitment agency",
  "staffing agency",
];

const RECRUITER_PHRASES = [
  "hiring",
  "recruitment",
  "staffing",
  "placing candidates",
  "tradespeople available",
  "skilled workers",
  "temporary staff",
  "contract workers",
];

// --- Functions ---

/**
 * Load screening configuration from the knowledge base.
 */
export async function getScreeningConfig(orgId: string): Promise<ScreeningConfig> {
  const { data: entries } = await supabaseAdmin
    .from("knowledge_base")
    .select("category, title, content")
    .eq("organisation_id", orgId)
    .eq("is_active", true)
    .in("category", ["screening_vip", "screening_blocked", "screening_rules"])
    .order("sort_order", { ascending: true });

  const config: ScreeningConfig = {
    vipCallers: [],
    blockedCallers: [],
    customRules: [],
  };

  for (const entry of entries ?? []) {
    switch (entry.category) {
      case "screening_vip":
        config.vipCallers.push({ title: entry.title, content: entry.content });
        break;
      case "screening_blocked":
        config.blockedCallers.push({ title: entry.title, content: entry.content });
        break;
      case "screening_rules":
        config.customRules.push({ title: entry.title, content: entry.content });
        break;
    }
  }

  return config;
}

/**
 * Classify a caller based on CRM lookup result and screening config.
 *
 * @param orgId - Organisation ID
 * @param lookupResult - Result from GHL contact lookup (null if not found)
 * @param callerNumber - The caller's phone number
 */
export async function classifyCaller(
  orgId: string,
  lookupResult: { id?: string; name?: string; firstName?: string; tags?: string[] } | null,
  callerNumber: string,
): Promise<ScreeningResult> {
  const config = await getScreeningConfig(orgId);

  // 1. Check VIP list
  const vipMatch = checkVipList(config.vipCallers, callerNumber, lookupResult?.name ?? lookupResult?.firstName);
  if (vipMatch) {
    return {
      classification: "vip",
      recommendation: "transfer_immediately",
      is_vip: true,
      is_blocked: false,
      vip_note: vipMatch,
    };
  }

  // 2. Check blocked list
  const blockedMatch = checkBlockedList(config.blockedCallers, callerNumber, lookupResult?.name ?? lookupResult?.firstName);
  if (blockedMatch) {
    return {
      classification: "blocked",
      recommendation: "block_politely",
      is_vip: false,
      is_blocked: true,
      blocked_reason: blockedMatch,
    };
  }

  // 3. Check GHL tags for classification
  if (lookupResult) {
    const tags = (lookupResult.tags as string[]) ?? [];
    const tagStr = tags.join(" ").toLowerCase();

    if (tags.some((t) => t.includes("supplier") || t.includes("subcontractor"))) {
      const isSub = tagStr.includes("subcontractor");
      return {
        classification: isSub ? "subcontractor" : "supplier",
        recommendation: "handle_query",
        is_vip: false,
        is_blocked: false,
      };
    }

    if (tags.some((t) => t.includes("payment") || t.includes("invoice"))) {
      return {
        classification: "existing_client",
        recommendation: "handle_or_callback",
        is_vip: false,
        is_blocked: false,
      };
    }

    // Known contact — existing client
    return {
      classification: "existing_client",
      recommendation: "handle_or_callback",
      is_vip: false,
      is_blocked: false,
    };
  }

  // 4. Unknown caller — new inquiry
  return {
    classification: "new_inquiry",
    recommendation: "qualify_and_callback",
    is_vip: false,
    is_blocked: false,
  };
}

/**
 * Detect whether conversation context suggests a sales/cold call.
 */
export function detectSalesCall(conversationContext: string): SalesDetectionResult {
  const lower = conversationContext.toLowerCase();
  const matchedPatterns: string[] = [];

  // Check sales phrases
  for (const phrase of SALES_PHRASES) {
    if (lower.includes(phrase)) {
      matchedPatterns.push(phrase);
    }
  }

  // Check sales company types
  for (const companyType of SALES_COMPANY_TYPES) {
    if (lower.includes(companyType)) {
      matchedPatterns.push(companyType);
    }
  }

  // Check recruiter phrases
  let isRecruiter = false;
  for (const phrase of RECRUITER_PHRASES) {
    if (lower.includes(phrase)) {
      matchedPatterns.push(phrase);
      isRecruiter = true;
    }
  }

  if (matchedPatterns.length === 0) {
    return { is_likely_sales: false, confidence: "low", matched_patterns: [] };
  }

  const confidence = matchedPatterns.length >= 3 ? "high" : matchedPatterns.length >= 2 ? "medium" : "low";

  return {
    is_likely_sales: true,
    confidence,
    matched_patterns: matchedPatterns,
  };
}

/**
 * Build the screening section for the ElevenLabs system prompt.
 */
export async function buildScreeningPromptSection(orgId: string, builderName: string): Promise<string> {
  const config = await getScreeningConfig(orgId);

  let section = `
[GATEKEEPER RULES]
You are ${builderName}'s gatekeeper. Your primary job is protecting their time.
NEVER transfer a call without first understanding why the caller needs to speak to ${builderName}.

When a caller asks to speak to ${builderName}:
1. Always ask what it's regarding: "Of course, can I ask what it's regarding so I can make sure ${builderName} has the right information when they pick up?"
2. Use lookup_caller to check if they are a known contact
3. Follow the screening decision matrix based on the result AND the lookup_caller screening data

SCREENING DECISION MATRIX:

1. VIP CALLER (lookup_caller returns is_vip: true):
→ Transfer immediately using escalate_to_builder with urgency_level "urgent"
→ Say: "Let me get ${builderName} on the line for you right away."

2. EXISTING CLIENT - URGENT (recognised contact, mentions active project, emergency, complaint, dispute, sounds stressed):
→ Use escalate_to_builder with urgency_level "urgent" or "emergency"
→ Say: "Let me get ${builderName} on the line for you now."

3. EXISTING CLIENT - NON-URGENT (recognised contact, routine question, schedule query, general update):
→ Handle it yourself. Only escalate if you genuinely cannot help.
→ Say: "${builderName}'s on site at the moment but I can probably help you with that. [Handle the query]. If you do need to speak to ${builderName} directly, I can book you a callback - what time works?"

4. NEW INQUIRY (not in CRM, mentions building work, extension, renovation, quote):
→ Qualify the lead, capture details, book a callback. Do NOT transfer.
→ Say: "${builderName}'s out on site right now but I can get all the details and have him call you back at a time that suits you. He'll have everything he needs to have a proper conversation with you. What's the project you're looking at?"

5. SALES/COLD CALL (uses sales language, asks for "the owner" or "decision maker" not by name, mentions software/insurance/marketing/SEO/energy/telecoms/payments):
→ Block politely. Use tag_call_outcome with outcome "sales_blocked". Do NOT follow up.
→ Say: "${builderName}'s not available for that I'm afraid. If you'd like to send the details over by email I can make sure it gets looked at."
→ If they push: "I understand, but ${builderName}'s asked me to handle these enquiries. The best route is to email through and if it's something we need, we'll be in touch."

6. SUPPLIER (recognised from CRM tags, mentions deliveries, materials, orders, specific job/site):
→ Handle if possible (take delivery details, confirm schedules). Escalate only if genuinely urgent (material shortage affecting today's work, access issue on site right now).
→ Say: "${builderName}'s on site but I can help with that. What's the update?"

7. SUBCONTRACTOR (recognised from CRM tags, mentions availability, scheduling, a specific job):
→ Handle scheduling queries. Escalate only if it affects today's work.
→ Say: "Let me check the schedule for you."

8. RECRUITER (mentions hiring, recruitment, staffing, placing candidates, "we have tradespeople available"):
→ Block politely. Use tag_call_outcome with outcome "recruiter_blocked".
→ Say: "Thanks for calling but we handle recruitment internally. If you'd like to send details by email we can keep them on file."

9. CALLER WON'T SAY what it's about ("It's personal", "He'll know", refuses details):
→ Take a message. Do NOT transfer. Use log_message and tag_call_outcome with outcome "message_taken".
→ Say: "No problem at all, I completely understand. ${builderName}'s on site and I'm not able to put calls through without a bit of context - he's asked me to manage his calls while he's working. I can take your name and number and have him call you back. When would be the best time to reach you?"
→ If they insist it's urgent: "I appreciate that. Let me take your name and number and I'll send ${builderName} a message right now so he can call you back as soon as he's free. That's usually within the hour."

SALES DETECTION - These phrases/topics indicate a likely sales call:
- "I'm calling about your business insurance"
- "We help companies like yours with..."
- "I'm following up on an email/letter we sent"
- "Who handles your [marketing/IT/energy/payments]?"
- "I'd like to speak to the business owner / the person who handles..."
- "This is a courtesy call"
- "We've been trying to reach you about..."
- "Are you happy with your current..."
- "We can save you money on..."
- "Just a quick call to introduce..."
- "I'm from [company] and we specialise in..."

Sales company types (almost always sales): SEO/marketing agencies, business energy brokers, merchant services/card payment providers, insurance brokers (unless known), telecoms providers, IT support companies, accountancy firms cold calling, HR/employment law services.

NOTE: If a supplier or sub uses similar language, the lookup_caller result should catch them as a known contact before the sales filter kicks in. Known contacts always get treated as legitimate.

ESCALATION LEVELS:
- IMMEDIATE (flood, fire, structural, safety, gas, electric): Transfer NOW. Keep trying + SMS if no answer.
- URGENT (complaint, payment dispute, time-sensitive scheduling, supplier issue affecting today): Transfer. If no answer, take message + urgent SMS + 30-min follow-up.
- STANDARD (client wants to chat, non-urgent question, general callback): Take message, schedule callback, no transfer attempt.
- BLOCKED (sales, cold calls, recruiters, won't identify themselves): Polite deflection, no follow-up.

IMPORTANT: At the end of every call, use the tag_call_outcome tool to record the screening outcome.`;

  // Add VIP list
  if (config.vipCallers.length > 0) {
    section += "\n\nVIP CALLERS (always transfer immediately):";
    for (const vip of config.vipCallers) {
      section += `\n- ${vip.title}: ${vip.content}`;
    }
  }

  // Add blocked list
  if (config.blockedCallers.length > 0) {
    section += "\n\nBLOCKED CALLERS (always block):";
    for (const blocked of config.blockedCallers) {
      section += `\n- ${blocked.title}: ${blocked.content}`;
    }
  }

  // Add custom rules
  if (config.customRules.length > 0) {
    section += "\n\nCUSTOM SCREENING RULES:";
    for (const rule of config.customRules) {
      section += `\n- ${rule.title}: ${rule.content}`;
    }
  }

  return section;
}

// --- Internal helpers ---

function checkVipList(
  vipCallers: Array<{ title: string; content: string }>,
  callerNumber: string,
  callerName?: string,
): string | null {
  const normalizedNumber = normalizePhone(callerNumber);

  for (const vip of vipCallers) {
    const combined = `${vip.title} ${vip.content}`.toLowerCase();

    // Check phone number match
    if (normalizedNumber && combined.includes(normalizedNumber)) {
      return vip.content;
    }

    // Check name match
    if (callerName) {
      const nameWords = callerName.toLowerCase().split(/\s+/);
      if (nameWords.some((word) => word.length > 2 && combined.includes(word))) {
        return vip.content;
      }
    }
  }

  return null;
}

function checkBlockedList(
  blockedCallers: Array<{ title: string; content: string }>,
  callerNumber: string,
  callerName?: string,
): string | null {
  const normalizedNumber = normalizePhone(callerNumber);

  for (const blocked of blockedCallers) {
    const combined = `${blocked.title} ${blocked.content}`.toLowerCase();

    if (normalizedNumber && combined.includes(normalizedNumber)) {
      return blocked.content;
    }

    if (callerName) {
      const nameWords = callerName.toLowerCase().split(/\s+/);
      if (nameWords.some((word) => word.length > 2 && combined.includes(word))) {
        return blocked.content;
      }
    }
  }

  return null;
}

/** Strip non-digit characters for phone number comparison. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
