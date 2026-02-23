import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";

/**
 * Check if a webhook event has already been processed (idempotency).
 * Returns true if the event is new and should be processed.
 * Returns false if the event was already processed (duplicate).
 */
export async function claimWebhookEvent(
  source: string,
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("webhook_events")
    .insert({
      source,
      event_id: eventId,
      event_type: eventType,
      payload,
    })
    .select("id")
    .single();

  if (error) {
    // Unique constraint violation means this event was already claimed
    if (error.code === "23505") {
      logger.info({ source, eventId }, "Duplicate webhook event, skipping");
      return false;
    }
    throw new Error(`Failed to claim webhook event: ${error.message}`);
  }

  return !!data;
}

export async function markWebhookProcessed(source: string, eventId: string) {
  await supabaseAdmin
    .from("webhook_events")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("source", source)
    .eq("event_id", eventId);
}

export async function markWebhookFailed(source: string, eventId: string, error: string) {
  await supabaseAdmin
    .from("webhook_events")
    .update({ error })
    .eq("source", source)
    .eq("event_id", eventId);
}
