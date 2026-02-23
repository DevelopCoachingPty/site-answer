import { env } from "../../config/env.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import { ExternalServiceError } from "../../lib/errors.js";

const MS_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// --- OAuth ---

export function getOAuthAuthorizeUrl(orgId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.MS_CLIENT_ID ?? "",
    redirect_uri: env.MS_REDIRECT_URI ?? "",
    scope: "Calendars.ReadWrite offline_access",
    state: `outlook:${orgId}`,
  });

  return `${MS_AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const response = await fetch(`${MS_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID ?? "",
      client_secret: env.MS_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: env.MS_REDIRECT_URI ?? "",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ExternalServiceError("Outlook Calendar", `Token exchange failed: ${body}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

export async function storeTokens(orgId: string, tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  await supabaseAdmin
    .from("organisations")
    .update({
      calendar_type: "outlook",
      calendar_credentials_encrypted: encrypt(tokens.access_token),
      calendar_refresh_token_encrypted: encrypt(tokens.refresh_token),
      calendar_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("id", orgId);
}

async function refreshTokens(orgId: string): Promise<string> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("calendar_refresh_token_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.calendar_refresh_token_encrypted) {
    throw new ExternalServiceError("Outlook Calendar", "No refresh token found");
  }

  const refreshToken = decrypt(org.calendar_refresh_token_encrypted);

  const response = await fetch(`${MS_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID ?? "",
      client_secret: env.MS_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new ExternalServiceError("Outlook Calendar", "Token refresh failed");
  }

  const tokens = await response.json() as { access_token: string; refresh_token: string; expires_in: number };

  await storeTokens(orgId, tokens);
  return tokens.access_token;
}

async function graphFetch(
  orgId: string,
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<Response> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("calendar_credentials_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.calendar_credentials_encrypted) {
    throw new ExternalServiceError("Outlook Calendar", "Not connected");
  }

  let accessToken = decrypt(org.calendar_credentials_encrypted);

  const response = await fetch(`${MS_GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401 && !retried) {
    logger.info({ orgId }, "Outlook token expired, refreshing");
    accessToken = await refreshTokens(orgId);
    return graphFetch(orgId, path, options, true);
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error({ orgId, path, status: response.status, body }, "Graph API error");
    throw new ExternalServiceError("Outlook Calendar", `API call failed (${response.status})`);
  }

  return response;
}

// --- Calendar Operations ---

export async function listCalendars(orgId: string) {
  const response = await graphFetch(orgId, "/me/calendars");
  const data = await response.json() as {
    value: Array<{ id: string; name: string; isDefaultCalendar?: boolean }>;
  };
  return (data.value ?? []).map((c) => ({
    id: c.id,
    summary: c.name,
    primary: c.isDefaultCalendar,
  }));
}

export async function getFreeBusySlots(
  orgId: string,
  _calendarId: string,
  timeMin: string,
  timeMax: string,
) {
  const response = await graphFetch(orgId, "/me/calendar/getSchedule", {
    method: "POST",
    body: JSON.stringify({
      schedules: ["me"],
      startTime: { dateTime: timeMin, timeZone: "UTC" },
      endTime: { dateTime: timeMax, timeZone: "UTC" },
    }),
  });

  const data = await response.json() as {
    value: Array<{
      scheduleItems: Array<{ start: { dateTime: string }; end: { dateTime: string } }>;
    }>;
  };

  return (data.value?.[0]?.scheduleItems ?? []).map((item) => ({
    start: item.start.dateTime,
    end: item.end.dateTime,
  }));
}

export async function createEvent(
  orgId: string,
  _calendarId: string,
  event: {
    summary: string;
    start: string;
    end: string;
    description?: string;
    attendees?: Array<{ email: string }>;
  },
) {
  const response = await graphFetch(orgId, "/me/events", {
    method: "POST",
    body: JSON.stringify({
      subject: event.summary,
      body: event.description ? { contentType: "text", content: event.description } : undefined,
      start: { dateTime: event.start, timeZone: "UTC" },
      end: { dateTime: event.end, timeZone: "UTC" },
      attendees: event.attendees?.map((a) => ({
        emailAddress: { address: a.email },
        type: "required",
      })),
    }),
  });

  return response.json() as Promise<{ id: string }>;
}

export async function cancelEvent(orgId: string, _calendarId: string, eventId: string) {
  await graphFetch(orgId, `/me/events/${eventId}`, { method: "DELETE" });
}

export async function disconnect(orgId: string) {
  await supabaseAdmin
    .from("organisations")
    .update({
      calendar_type: null,
      calendar_credentials_encrypted: null,
      calendar_refresh_token_encrypted: null,
      calendar_token_expires_at: null,
      calendar_id: null,
    })
    .eq("id", orgId);
}
