/**
 * Agent Sync Service
 *
 * Syncs knowledge base and script changes to ElevenLabs agents inline (no queue).
 * Called when KB entries or scripts are created/updated/deleted/published.
 */

import { logger } from "../lib/logger.js";
import * as elevenlabsClient from "../modules/elevenlabs/elevenlabs.client.js";
import { supabaseAdmin } from "../lib/supabase.js";

export async function syncAgent(
  orgId: string,
  trigger: string,
): Promise<void> {
  const log = logger.child({ orgId, trigger });
  log.info("Syncing agent configuration");

  // Get org's ElevenLabs agent ID
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("elevenlabs_agent_id, name")
    .eq("id", orgId)
    .single();

  if (!org) {
    log.warn("Organisation not found");
    return;
  }

  if (!org.elevenlabs_agent_id) {
    // Agent not provisioned yet - provision it
    log.info("No agent found, provisioning new agent");
    await elevenlabsClient.provisionAgent(orgId);
    return;
  }

  // Update the agent's prompt with latest KB + scripts
  await elevenlabsClient.updateAgentPrompt(org.elevenlabs_agent_id, orgId);

  log.info({ agentId: org.elevenlabs_agent_id }, "Agent prompt updated");
}
