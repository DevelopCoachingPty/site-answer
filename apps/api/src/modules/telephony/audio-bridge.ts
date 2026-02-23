/**
 * Audio Bridge: Twilio Media Streams <-> ElevenLabs WebSocket
 *
 * This module handles real-time audio streaming between Twilio (callers)
 * and ElevenLabs Conversational AI agents.
 *
 * Audio format conversion:
 * - Twilio sends: mulaw encoded, 8kHz sample rate, mono
 * - ElevenLabs expects: PCM16, 16kHz sample rate
 * - Reverse conversion for agent responses
 *
 * Each active call maintains a BridgeSession with two WebSocket connections.
 */

import { WebSocket } from "ws";
import { logger } from "../../lib/logger.js";
import { env } from "../../config/env.js";

interface BridgeSession {
  callSid: string;
  callId: string;
  organisationId: string;
  agentId: string;
  flowType: string;
  twilioWs: WebSocket | null;
  elevenLabsWs: WebSocket | null;
  startedAt: Date;
  streamSid: string | null;
}

// Active bridge sessions indexed by callId
const activeSessions = new Map<string, BridgeSession>();

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getSession(callId: string): BridgeSession | undefined {
  return activeSessions.get(callId);
}

export function createSession(params: {
  callId: string;
  callSid: string;
  organisationId: string;
  agentId: string;
  flowType: string;
}): BridgeSession {
  const session: BridgeSession = {
    ...params,
    twilioWs: null,
    elevenLabsWs: null,
    startedAt: new Date(),
    streamSid: null,
  };
  activeSessions.set(params.callId, session);
  return session;
}

/**
 * Connect to ElevenLabs Conversational AI WebSocket
 */
export function connectToElevenLabs(session: BridgeSession): void {
  const log = logger.child({ callId: session.callId, agentId: session.agentId });

  const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${session.agentId}`;

  const elWs = new WebSocket(wsUrl, {
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY ?? "",
    },
  });

  session.elevenLabsWs = elWs;

  elWs.on("open", () => {
    log.info("ElevenLabs WebSocket connected");
  });

  elWs.on("message", (data: Buffer) => {
    // Forward audio from ElevenLabs to Twilio
    if (session.twilioWs?.readyState === WebSocket.OPEN && session.streamSid) {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "audio") {
          // ElevenLabs sends base64 PCM16 audio
          // Convert to mulaw for Twilio (simplified - real implementation needs proper conversion)
          session.twilioWs.send(JSON.stringify({
            event: "media",
            streamSid: session.streamSid,
            media: {
              payload: message.audio, // Base64 encoded audio
            },
          }));
        } else if (message.type === "tool_call") {
          log.info({ tool: message.tool_name }, "ElevenLabs tool call");
          // Tool calls are handled by the webhook endpoints
        }
      } catch (err) {
        log.error({ err }, "Error processing ElevenLabs message");
      }
    }
  });

  elWs.on("close", () => {
    log.info("ElevenLabs WebSocket closed");
    cleanupSession(session.callId);
  });

  elWs.on("error", (err) => {
    log.error({ err }, "ElevenLabs WebSocket error");
  });
}

/**
 * Handle incoming Twilio Media Stream messages
 */
export function handleTwilioMessage(session: BridgeSession, message: string): void {
  const log = logger.child({ callId: session.callId });

  try {
    const data = JSON.parse(message);

    switch (data.event) {
      case "connected":
        log.info("Twilio stream connected");
        break;

      case "start":
        session.streamSid = data.start?.streamSid ?? null;
        session.callSid = data.start?.callSid ?? session.callSid;
        log.info({ streamSid: session.streamSid }, "Twilio stream started");

        // Connect to ElevenLabs now that we have the stream
        connectToElevenLabs(session);
        break;

      case "media":
        // Forward audio from Twilio to ElevenLabs
        if (session.elevenLabsWs?.readyState === WebSocket.OPEN) {
          // Twilio sends base64 mulaw audio
          // Convert to PCM16 for ElevenLabs (simplified)
          session.elevenLabsWs.send(JSON.stringify({
            type: "audio",
            audio: data.media?.payload, // Base64 encoded audio
          }));
        }
        break;

      case "stop":
        log.info("Twilio stream stopped");
        cleanupSession(session.callId);
        break;

      default:
        log.debug({ event: data.event }, "Unknown Twilio stream event");
    }
  } catch (err) {
    log.error({ err }, "Error handling Twilio message");
  }
}

/**
 * Clean up a bridge session
 */
export function cleanupSession(callId: string): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  const log = logger.child({ callId });
  log.info("Cleaning up bridge session");

  if (session.elevenLabsWs?.readyState === WebSocket.OPEN) {
    session.elevenLabsWs.close();
  }

  if (session.twilioWs?.readyState === WebSocket.OPEN) {
    session.twilioWs.close();
  }

  activeSessions.delete(callId);
}

export { type BridgeSession };
