/**
 * Shared Twilio REST API client
 *
 * Uses raw fetch (no SDK) matching the existing pattern in the codebase.
 * All Twilio REST calls go through this module.
 */

import { env } from "../../config/env.js";
import { ExternalServiceError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

function getAccountPath(): string {
  const sid = env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new ExternalServiceError("Twilio", "TWILIO_ACCOUNT_SID not configured");
  return `/Accounts/${sid}`;
}

function getAuthHeader(): string {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new ExternalServiceError("Twilio", "Twilio credentials not configured");
  }
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

/**
 * Make a raw POST request to the Twilio REST API.
 * Body is sent as application/x-www-form-urlencoded.
 */
export async function twilioFetch(
  path: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = `${TWILIO_API}${getAccountPath()}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ path, status: response.status, body: text }, "Twilio API error");
    throw new ExternalServiceError("Twilio", `API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Update an in-progress call with new TwiML.
 * Used to redirect the caller into a Conference room.
 */
export async function updateCall(callSid: string, twiml: string): Promise<void> {
  await twilioFetch(`/Calls/${callSid}.json`, { Twiml: twiml });
}

/**
 * Create an outbound call connecting the recipient to TwiML.
 * Returns the new call's SID.
 */
export async function createOutboundCall(params: {
  to: string;
  from: string;
  twiml: string;
  timeout?: number;
  statusCallback?: string;
  statusCallbackEvent?: string;
}): Promise<string> {
  const body: Record<string, string> = {
    To: params.to,
    From: params.from,
    Twiml: params.twiml,
  };

  if (params.timeout) body.Timeout = String(params.timeout);
  if (params.statusCallback) body.StatusCallback = params.statusCallback;
  if (params.statusCallbackEvent) body.StatusCallbackEvent = params.statusCallbackEvent;

  const data = await twilioFetch("/Calls.json", body);
  return data.sid as string;
}

/**
 * Cancel or hang up a call.
 */
export async function cancelCall(callSid: string): Promise<void> {
  await twilioFetch(`/Calls/${callSid}.json`, { Status: "canceled" });
}

/**
 * Send an SMS message.
 */
export async function sendSms(
  from: string,
  to: string,
  body: string,
): Promise<string> {
  const data = await twilioFetch("/Messages.json", {
    From: from,
    To: to,
    Body: body,
  });
  return data.sid as string;
}
