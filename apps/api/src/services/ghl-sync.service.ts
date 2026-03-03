/**
 * GHL Sync Service
 *
 * Handles GoHighLevel API operations inline (no queue).
 * Called from post-call processing and tag_call_outcome tool handler.
 */

import { logger } from "../lib/logger.js";
import * as ghlClient from "../modules/ghl/ghl.client.js";
import * as callsService from "../modules/calls/calls.service.js";
import { supabaseAdmin } from "../lib/supabase.js";

export interface GhlSyncData {
  organisationId: string;
  callId: string;
  actions: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Retry once on transient errors (429, 503)
    if (msg.includes("429") || msg.includes("503")) {
      logger.warn({ label }, "Transient GHL error, retrying in 2s");
      await new Promise((r) => setTimeout(r, 2000));
      return fn();
    }
    throw err;
  }
}

export async function processGhlSync(data: GhlSyncData): Promise<void> {
  const log = logger.child({ orgId: data.organisationId });
  log.info("Processing GHL sync");

  const { organisationId, callId, actions } = data;

  // Get org details for GHL location
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("ghl_location_id, ghl_access_token_encrypted")
    .eq("id", organisationId)
    .single();

  if (!org?.ghl_location_id || !org.ghl_access_token_encrypted) {
    log.warn("GHL not connected, skipping sync");
    return;
  }

  // Get call details for context
  const call = await callsService.getCall(organisationId, callId);

  for (const action of actions) {
    try {
      switch (action.type) {
        case "create_new_contact": {
          const contactId = action.data.contact_id as string | undefined;
          if (contactId) {
            await withRetry(
              () => ghlClient.addContactNote(
                organisationId,
                contactId,
                `SiteAnswer call summary:\n${call.summary ?? "No summary available"}\nDuration: ${call.duration_seconds ?? 0}s`,
              ),
              "create_new_contact_note",
            );
          }
          break;
        }

        case "lookup_caller": {
          const contactId = action.data.contact_id as string | undefined;
          if (contactId) {
            await withRetry(
              () => ghlClient.addContactNote(
                organisationId,
                contactId,
                `SiteAnswer call received\nType: ${call.flow_type ?? "unknown"}\nSummary: ${call.summary ?? "N/A"}`,
              ),
              "lookup_caller_note",
            );
          }
          break;
        }

        case "escalate_to_builder": {
          log.warn({ action }, "Escalation synced to GHL");
          break;
        }

        case "tag_contact": {
          const contactId = action.data.contact_id as string | undefined;
          const tag = action.data.tag as string | undefined;
          const notes = action.data.notes as string | undefined;

          if (contactId && tag) {
            await withRetry(() => ghlClient.addContactTag(organisationId, contactId, [tag]), "tag_contact");
            log.info({ contactId, tag }, "GHL tag applied");

            if (notes) {
              await withRetry(
                () => ghlClient.addContactNote(organisationId, contactId, `SiteAnswer screening: ${tag}\n${notes}`),
                "tag_contact_note",
              );
            }
          }
          break;
        }

        case "tag_call_outcome": {
          const outcomeContactId = action.data.contact_id as string | undefined;
          const outcomeTag = action.data.ghl_tag as string | undefined;

          if (outcomeContactId && outcomeTag) {
            await withRetry(() => ghlClient.addContactTag(organisationId, outcomeContactId, [outcomeTag]), "tag_outcome");

            const noteText = `SiteAnswer call outcome: ${action.data.outcome ?? outcomeTag}\n${
              call.summary ? `Summary: ${call.summary}` : ""
            }\nDuration: ${call.duration_seconds ?? 0}s`;

            await withRetry(() => ghlClient.addContactNote(organisationId, outcomeContactId, noteText), "tag_outcome_note");
            log.info({ contactId: outcomeContactId, tag: outcomeTag }, "Screening outcome tagged in GHL");
          }
          break;
        }

        default:
          log.debug({ actionType: action.type }, "No GHL sync action for this type");
      }
    } catch (err) {
      log.error({ err, actionType: action.type }, "GHL sync action failed");
      // Don't throw - continue processing other actions
    }
  }

  log.info({ callId, actionCount: actions.length }, "GHL sync complete");
}
