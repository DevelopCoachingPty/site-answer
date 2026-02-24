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

// --- Mulaw <-> PCM16 codec conversion ---

// Standard mulaw decompression lookup table
const MULAW_DECODE_TABLE = new Int16Array(256);
(function buildMulawDecodeTable() {
  for (let i = 0; i < 256; i++) {
    let mu = ~i & 0xff;
    const sign = mu & 0x80 ? -1 : 1;
    mu = mu & 0x7f;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    let sample = ((mantissa << 1) + 33) << (exponent + 2);
    sample -= 0x84;
    MULAW_DECODE_TABLE[i] = sign * sample;
  }
})();

/** Convert mulaw 8kHz mono to PCM16 16kHz mono (linear interpolation upsample) */
function mulawToPcm16(mulawBase64: string): string {
  const mulawBytes = Buffer.from(mulawBase64, "base64");
  // Decode mulaw to PCM16 at 8kHz
  const pcm8k = new Int16Array(mulawBytes.length);
  for (let i = 0; i < mulawBytes.length; i++) {
    pcm8k[i] = MULAW_DECODE_TABLE[mulawBytes[i]!]!;
  }
  // Upsample 8kHz -> 16kHz via linear interpolation
  const pcm16k = new Int16Array(pcm8k.length * 2);
  for (let i = 0; i < pcm8k.length - 1; i++) {
    pcm16k[i * 2] = pcm8k[i]!;
    pcm16k[i * 2 + 1] = Math.round((pcm8k[i]! + pcm8k[i + 1]!) / 2);
  }
  if (pcm8k.length > 0) {
    pcm16k[(pcm8k.length - 1) * 2] = pcm8k[pcm8k.length - 1]!;
    pcm16k[(pcm8k.length - 1) * 2 + 1] = pcm8k[pcm8k.length - 1]!;
  }
  return Buffer.from(pcm16k.buffer).toString("base64");
}

/** Encode a single PCM16 sample to mulaw byte */
function pcm16ToMulawSample(sample: number): number {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 0x84;
  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  sample += MULAW_BIAS;
  let exponent = 7;
  const mask = 0x4000;
  for (; exponent > 0; exponent--) {
    if (sample & mask) break;
    sample <<= 1;
  }
  const mantissa = (sample >> 10) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Convert PCM16 16kHz mono to mulaw 8kHz mono (downsample by averaging pairs) */
function pcm16ToMulaw(pcm16Base64: string): string {
  const pcmBuf = Buffer.from(pcm16Base64, "base64");
  const pcm16k = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, pcmBuf.byteLength / 2);
  // Downsample 16kHz -> 8kHz by averaging pairs
  const samples8k = Math.floor(pcm16k.length / 2);
  const mulawBytes = Buffer.alloc(samples8k);
  for (let i = 0; i < samples8k; i++) {
    const avg = Math.round((pcm16k[i * 2]! + pcm16k[i * 2 + 1]!) / 2);
    mulawBytes[i] = pcm16ToMulawSample(avg);
  }
  return mulawBytes.toString("base64");
}

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
          // ElevenLabs sends base64 PCM16 16kHz — convert to mulaw 8kHz for Twilio
          const mulawPayload = pcm16ToMulaw(message.audio);
          session.twilioWs.send(JSON.stringify({
            event: "media",
            streamSid: session.streamSid,
            media: {
              payload: mulawPayload,
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
          // Twilio sends base64 mulaw 8kHz — convert to PCM16 16kHz for ElevenLabs
          const pcmPayload = mulawToPcm16(data.media?.payload ?? "");
          session.elevenLabsWs.send(JSON.stringify({
            type: "audio",
            audio: pcmPayload,
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
