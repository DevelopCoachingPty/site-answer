import { env } from "../../config/env.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import { ExternalServiceError } from "../../lib/errors.js";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

// --- OAuth ---

export function getOAuthAuthorizeUrl(orgId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: env.GOOGLE_REDIRECT_URI ?? "",
    scope: "https://www.googleapis.com/auth/calendar",
    state: `google:${orgId}`,
    access_type: "offline",
    prompt: "consent",
  });

  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: env.GOOGLE_REDIRECT_URI ?? "",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ExternalServiceError("Google Calendar", `Token exchange failed: ${body}`);
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
      calendar_type: "google",
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
    throw new ExternalServiceError("Google Calendar", "No refresh token found");
  }

  const refreshToken = decrypt(org.calendar_refresh_token_encrypted);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new ExternalServiceError("Google Calendar", "Token refresh failed");
  }

  const tokens = await response.json() as { access_token: string; expires_in: number };

  await supabaseAdmin
    .from("organisations")
    .update({
      calendar_credentials_encrypted: encrypt(tokens.access_token),
      calendar_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("id", orgId);

  return tokens.access_token;
}

async function googleFetch(
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
    throw new ExternalServiceError("Google Calendar", "Not connected");
  }

  let accessToken = decrypt(org.calendar_credentials_encrypted);

  const response = await fetch(`${GOOGLE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401 && !retried) {
    logger.info({ orgId }, "Google Calendar token expired, refreshing");
    accessToken = await refreshTokens(orgId);
    return googleFetch(orgId, path, options, true);
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error({ orgId, path, status: response.status, body }, "Google Calendar API error");
    throw new ExternalServiceError("Google Calendar", `API call failed (${response.status})`);
  }

  return response;
}

// --- Calendar Operations ---

export async function listCalendars(orgId: string) {
  const response = await googleFetch(orgId, "/users/me/calendarList");
  const data = await response.json() as {
    items: Array<{ id: string; summary: string; primary?: boolean }>;
  };
  return data.items ?? [];
}

export async function getFreeBusySlots(
  orgId: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
) {
  const response = await googleFetch(orgId, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    }),
  });

  const data = await response.json() as {
    calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
  };

  return data.calendars[calendarId]?.busy ?? [];
}

export async function createEvent(
  orgId: string,
  calendarId: string,
  event: {
    summary: string;
    start: string;
    end: string;
    description?: string;
    attendees?: Array<{ email: string }>;
  },
) {
  const response = await googleFetch(orgId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
      attendees: event.attendees,
    }),
  });

  return response.json() as Promise<{ id: string }>;
}

export async function cancelEvent(orgId: string, calendarId: string, eventId: string) {
  await googleFetch(orgId, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "DELETE",
  });
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
