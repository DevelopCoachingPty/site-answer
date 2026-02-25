/**
 * Warm Transfer Service
 *
 * Orchestrates moving a live call from ElevenLabs AI into a Twilio Conference
 * and dialing the builder in for a seamless handover.
 */

import { logger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import { WARM_TRANSFER } from "../../config/constants.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import * as twilioClient from "./twilio.client.js";
import * as callsService from "../calls/calls.service.js";
import { getSession } from "./audio-bridge.js";

const API_BASE = env.API_BASE_URL;

/** Generate a unique conference room name for a call */
export function generateConferenceRoom(callId: string): string {
  const short = callId.slice(0, 8);
  return `sa-transfer-${short}-${Date.now()}`;
}

/**
 * Move the caller into a Twilio Conference and dial the builder in.
 *
 * Called after the agent has had time to say goodbye (8-second delay).
 */
export async function initiateWarmTransfer(params: {
  callId: string;
  callSid: string;
  organisationId: string;
  orgPhoneNumber: string;
  builderPhone: string;
  builderName: string;
  callerName: string;
  callerNumber: string;
  reason: string;
  urgencyLevel: string;
  conferenceRoom: string;
}): Promise<void> {
  const log = logger.child({
    callId: params.callId,
    conference: params.conferenceRoom,
  });

  const session = getSession(params.callId);

  try {
    // Step 1: Move the caller's call into the Conference
    log.info("Moving caller into conference");

    const callerConferenceTwiml = `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" waitUrl="${WARM_TRANSFER.HOLD_MUSIC_URL}" statusCallback="${API_BASE}/api/v1/webhooks/telephony/conference-status" statusCallbackEvent="join leave end">${params.conferenceRoom}</Conference></Dial></Response>`;

    await twilioClient.updateCall(params.callSid, callerConferenceTwiml);

    // Update session and DB
    if (session?.warmTransfer) {
      session.warmTransfer.status = "caller_in_conference";
    }
    await callsService.updateCall(params.callId, {
      warm_transfer_status: "caller_in_conference",
    });

    log.info("Caller moved to conference, dialing builder");

    // Step 2: Dial the builder into the same Conference
    const builderTwiml = `<Response><Say>You have a call transfer from your AI assistant. ${params.callerName} is calling about: ${escapeXml(params.reason)}.</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${params.conferenceRoom}</Conference></Dial></Response>`;

    const builderCallSid = await twilioClient.createOutboundCall({
      to: params.builderPhone,
      from: params.orgPhoneNumber,
      twiml: builderTwiml,
      timeout: 20,
      statusCallback: `${API_BASE}/api/v1/webhooks/telephony/builder-call-status`,
      statusCallbackEvent: "initiated ringing answered completed no-answer busy failed",
    });

    // Store builder call SID
    if (session?.warmTransfer) {
      session.warmTransfer.builderCallSid = builderCallSid;
      session.warmTransfer.status = "builder_ringing";
    }
    await callsService.updateCall(params.callId, {
      builder_call_sid: builderCallSid,
      warm_transfer_status: "builder_ringing",
    });

    log.info({ builderCallSid }, "Builder dialed into conference");

    // Step 3: Start timeout for builder no-answer
    if (session?.warmTransfer) {
      session.warmTransfer.builderTimeoutId = setTimeout(async () => {
        if (session.warmTransfer && !session.warmTransfer.builderJoined) {
          log.warn("Builder did not answer within timeout");
          await handleBuilderNoAnswer(params);
        }
      }, WARM_TRANSFER.BUILDER_TIMEOUT_MS);
    }
  } catch (err) {
    log.error({ err }, "Warm transfer failed");

    if (session?.warmTransfer) {
      session.warmTransfer.status = "failed";
    }
    await callsService.updateCall(params.callId, {
      warm_transfer_status: "failed",
    });

    // Fallback: send SMS to builder
    try {
      await sendEscalationSms(params);
    } catch (smsErr) {
      log.error({ err: smsErr }, "Fallback SMS also failed");
    }

    throw err;
  }
}

/**
 * Handle the case where the builder doesn't answer the transfer call.
 * Sends SMS, tells the caller, and cleans up.
 */
export async function handleBuilderNoAnswer(params: {
  callId: string;
  callSid: string;
  organisationId: string;
  orgPhoneNumber: string;
  builderPhone: string;
  builderName: string;
  callerName: string;
  callerNumber: string;
  reason: string;
  conferenceRoom: string;
}): Promise<void> {
  const log = logger.child({ callId: params.callId });
  const session = getSession(params.callId);

  // Cancel builder call if still ringing
  if (session?.warmTransfer?.builderCallSid) {
    try {
      await twilioClient.cancelCall(session.warmTransfer.builderCallSid);
    } catch {
      // May already have ended, that's fine
    }
  }

  // Update session
  if (session?.warmTransfer) {
    session.warmTransfer.status = "builder_no_answer";
  }

  // Tell the caller the builder isn't available and hang up
  try {
    const noAnswerTwiml = `<Response><Say>${params.builderName} isn't available right now. They've been notified and will call you back shortly. Thank you for your patience.</Say><Hangup/></Response>`;
    await twilioClient.updateCall(params.callSid, noAnswerTwiml);
  } catch (err) {
    log.error({ err }, "Failed to update caller with no-answer message");
  }

  // Send SMS to builder
  await sendEscalationSms(params);

  // Update database
  await callsService.updateCall(params.callId, {
    warm_transfer_status: "builder_no_answer",
    follow_up_required: true,
    follow_up_notes: `Missed warm transfer: ${params.callerName} (${params.callerNumber}) - ${params.reason}`,
  });

  // Create in-app notification
  await supabaseAdmin.from("notifications").insert({
    organisation_id: params.organisationId,
    type: "escalation",
    title: "Missed warm transfer",
    message: `${params.callerName} (${params.callerNumber}) called about: ${params.reason}. Transfer was attempted but you didn't answer. Please call back ASAP.`,
  });

  log.info("Builder no-answer handled — SMS sent, caller notified");
}

/**
 * Send an escalation SMS to the builder.
 */
async function sendEscalationSms(params: {
  orgPhoneNumber: string;
  builderPhone: string;
  callerName: string;
  callerNumber: string;
  reason: string;
}): Promise<void> {
  const from = params.orgPhoneNumber || env.TWILIO_PHONE_NUMBER;
  if (!from) {
    logger.warn("No from number available for escalation SMS");
    return;
  }

  const body = `URGENT SiteAnswer: Missed transfer from ${params.callerName} (${params.callerNumber}). Reason: ${params.reason}. Please call back ASAP.`;

  await twilioClient.sendSms(from, params.builderPhone, body);
}

/** Escape special XML characters in user-provided strings */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
