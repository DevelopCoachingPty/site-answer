import { env } from "../../config/env.js";
import { GHL_RATE_LIMIT } from "../../config/constants.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import { ExternalServiceError } from "../../lib/errors.js";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_AUTH_BASE = "https://marketplace.gohighlevel.com";

// Simple in-memory rate limiter
const requestLog: number[] = [];

function checkRateLimit(): boolean {
  const now = Date.now();
  const windowStart = now - GHL_RATE_LIMIT.windowMs;

  // Clean old entries
  while (requestLog.length > 0 && requestLog[0]! < windowStart) {
    requestLog.shift();
  }

  if (requestLog.length >= GHL_RATE_LIMIT.maxRequests) {
    return false;
  }

  requestLog.push(now);
  return true;
}

// --- OAuth ---

export function getOAuthAuthorizeUrl(orgId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: env.GHL_REDIRECT_URI ?? "",
    client_id: env.GHL_CLIENT_ID ?? "",
    scope: "contacts.readonly contacts.write conversations.readonly conversations.write calendars.readonly calendars.write opportunities.readonly opportunities.write",
    state: orgId,
  });

  return `${GHL_AUTH_BASE}/oauth/chooselocation?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  locationId: string;
}> {
  const response = await fetch(`${GHL_AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GHL_CLIENT_ID ?? "",
      client_secret: env.GHL_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: env.GHL_REDIRECT_URI ?? "",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ExternalServiceError("GHL", `Token exchange failed: ${body}`);
  }

  return response.json();
}

export async function refreshTokens(orgId: string): Promise<string> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("ghl_refresh_token_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.ghl_refresh_token_encrypted) {
    throw new ExternalServiceError("GHL", "No refresh token found");
  }

  const refreshToken = decrypt(org.ghl_refresh_token_encrypted);

  const response = await fetch(`${GHL_AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GHL_CLIENT_ID ?? "",
      client_secret: env.GHL_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new ExternalServiceError("GHL", "Token refresh failed");
  }

  const tokens = await response.json() as { access_token: string; refresh_token: string; expires_in: number };

  // Store new encrypted tokens
  await storeTokens(orgId, tokens.access_token, tokens.refresh_token);

  return tokens.access_token;
}

export async function storeTokens(orgId: string, accessToken: string, refreshToken: string) {
  await supabaseAdmin
    .from("organisations")
    .update({
      ghl_access_token_encrypted: encrypt(accessToken),
      ghl_refresh_token_encrypted: encrypt(refreshToken),
    })
    .eq("id", orgId);
}

export async function getAccessToken(orgId: string): Promise<string> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("ghl_access_token_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.ghl_access_token_encrypted) {
    throw new ExternalServiceError("GHL", "Not connected to GoHighLevel");
  }

  return decrypt(org.ghl_access_token_encrypted);
}

export async function clearTokens(orgId: string) {
  await supabaseAdmin
    .from("organisations")
    .update({
      ghl_access_token_encrypted: null,
      ghl_refresh_token_encrypted: null,
      ghl_location_id: null,
    })
    .eq("id", orgId);
}

// --- API Helpers ---

async function ghlFetch(
  orgId: string,
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<Response> {
  if (!checkRateLimit()) {
    throw new ExternalServiceError("GHL", "Rate limit exceeded, please retry");
  }

  let accessToken = await getAccessToken(orgId);

  const response = await fetch(`${GHL_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
      ...options.headers,
    },
  });

  // Auto-refresh on 401
  if (response.status === 401 && !retried) {
    logger.info({ orgId }, "GHL token expired, refreshing");
    accessToken = await refreshTokens(orgId);
    return ghlFetch(orgId, path, options, true);
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error({ orgId, path, status: response.status, body }, "GHL API error");
    throw new ExternalServiceError("GHL", `API call failed (${response.status}): ${body}`);
  }

  return response;
}

// --- Contact Operations ---

export async function lookupContact(orgId: string, locationId: string, phoneNumber: string) {
  const response = await ghlFetch(
    orgId,
    `/contacts/?locationId=${locationId}&query=${encodeURIComponent(phoneNumber)}&limit=1`,
  );

  const data = await response.json() as { contacts: Array<Record<string, unknown>> };
  return data.contacts?.[0] ?? null;
}

export async function createContact(
  orgId: string,
  locationId: string,
  contact: {
    firstName?: string;
    lastName?: string;
    name?: string;
    phone?: string;
    email?: string;
    address1?: string;
    tags?: string[];
    customFields?: Array<{ key: string; value: string }>;
  },
) {
  const response = await ghlFetch(orgId, "/contacts/", {
    method: "POST",
    body: JSON.stringify({
      locationId,
      ...contact,
      tags: [...(contact.tags ?? []), "siteanswer-lead"],
    }),
  });

  const data = await response.json() as { contact: Record<string, unknown> };
  return data.contact;
}

export async function addContactNote(
  orgId: string,
  contactId: string,
  body: string,
) {
  const response = await ghlFetch(orgId, `/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

  return response.json();
}

export async function addContactTag(orgId: string, contactId: string, tags: string[]) {
  const response = await ghlFetch(orgId, `/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });

  return response.json();
}

// --- SMS ---

export async function sendSms(
  orgId: string,
  contactId: string,
  message: string,
) {
  const response = await ghlFetch(orgId, "/conversations/messages", {
    method: "POST",
    body: JSON.stringify({
      type: "SMS",
      contactId,
      message,
    }),
  });

  return response.json();
}

// --- Pipeline / Opportunities ---

export async function createOpportunity(
  orgId: string,
  locationId: string,
  input: {
    contactId: string;
    name: string;
    pipelineId: string;
    pipelineStageId: string;
    monetaryValue?: number;
  },
) {
  const response = await ghlFetch(orgId, "/opportunities/", {
    method: "POST",
    body: JSON.stringify({
      locationId,
      ...input,
    }),
  });

  return response.json();
}

// --- Calendar ---

export async function getCalendarSlots(
  orgId: string,
  calendarId: string,
  startDate: string,
  endDate: string,
) {
  const response = await ghlFetch(
    orgId,
    `/calendars/${calendarId}/free-slots?startDate=${startDate}&endDate=${endDate}`,
  );

  return response.json() as Promise<Record<string, unknown>>;
}

export async function bookAppointment(
  orgId: string,
  calendarId: string,
  input: {
    contactId: string;
    startTime: string;
    endTime: string;
    title?: string;
    notes?: string;
  },
) {
  const response = await ghlFetch(orgId, `/calendars/events/appointments`, {
    method: "POST",
    body: JSON.stringify({
      calendarId,
      ...input,
    }),
  });

  return response.json();
}

// --- Connection Check ---

export async function checkConnection(orgId: string): Promise<boolean> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("ghl_access_token_encrypted")
    .eq("id", orgId)
    .single();

  return !!org?.ghl_access_token_encrypted;
}
