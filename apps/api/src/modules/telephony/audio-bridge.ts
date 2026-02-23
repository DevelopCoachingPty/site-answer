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

import { logger } from "../../lib/logger.js";

interface BridgeSession {
  callSid: string;
  organisationId: string;
  agentId: string;
  twilioWs: unknown; // WebSocket connection from Twilio
  elevenLabsWs: unknown; // WebSocket connection to ElevenLabs
  startedAt: Date;
}

// Active bridge sessions indexed by Twilio Call SID
const activeSessions = new Map<string, BridgeSession>();

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getSession(callSid: string): BridgeSession | undefined {
  return activeSessions.get(callSid);
}

// TODO: Implement the full audio bridge
// 1. Accept Twilio WebSocket connection
// 2. Parse Twilio 'start' event for call metadata
// 3. Open WebSocket to ElevenLabs conversation API
// 4. Forward audio bidirectionally with format conversion
// 5. Handle tool calls from ElevenLabs
// 6. Clean up on call end

export { type BridgeSession };
