import { supabaseAdmin } from "../../lib/supabase.js";
import { ExternalServiceError } from "../../lib/errors.js";
import * as googleClient from "./google.client.js";
import * as outlookClient from "./outlook.client.js";
import * as ghlClient from "../ghl/ghl.client.js";

interface SlotResult {
  start: string;
  end: string;
}

async function getCalendarConfig(orgId: string) {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("calendar_type, calendar_id, calendar_credentials_encrypted, ghl_access_token_encrypted, ghl_location_id")
    .eq("id", orgId)
    .single();

  return org;
}

export async function getAvailableSlots(
  orgId: string,
  start: string,
  end: string,
  durationMinutes: number = 60,
): Promise<Array<{ start: string; end: string }>> {
  const org = await getCalendarConfig(orgId);
  if (!org) throw new ExternalServiceError("Calendar", "Organisation not found");

  let busySlots: SlotResult[];

  if (org.calendar_type === "google" && org.calendar_credentials_encrypted) {
    const calendarId = org.calendar_id ?? "primary";
    busySlots = await googleClient.getFreeBusySlots(orgId, calendarId, start, end);
  } else if (org.calendar_type === "outlook" && org.calendar_credentials_encrypted) {
    busySlots = await outlookClient.getFreeBusySlots(orgId, org.calendar_id ?? "primary", start, end);
  } else if (org.ghl_access_token_encrypted && org.ghl_location_id) {
    // Fallback to GHL calendar
    const result = await ghlClient.getCalendarSlots(orgId, org.calendar_id ?? "", start, end);
    return (result as { slots?: Array<{ start: string; end: string }> })?.slots ?? [];
  } else {
    return [];
  }

  // Calculate available slots from busy periods
  return calculateAvailableSlots(start, end, busySlots, durationMinutes);
}

function calculateAvailableSlots(
  rangeStart: string,
  rangeEnd: string,
  busySlots: SlotResult[],
  durationMinutes: number,
): Array<{ start: string; end: string }> {
  const available: Array<{ start: string; end: string }> = [];
  const durationMs = durationMinutes * 60 * 1000;
  const startTime = new Date(rangeStart).getTime();
  const endTime = new Date(rangeEnd).getTime();

  // Sort busy slots by start time
  const sorted = busySlots
    .map((s) => ({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() }))
    .sort((a, b) => a.start - b.start);

  let cursor = startTime;

  for (const busy of sorted) {
    if (cursor + durationMs <= busy.start) {
      // There's a gap before this busy slot
      let slotStart = cursor;
      while (slotStart + durationMs <= busy.start) {
        available.push({
          start: new Date(slotStart).toISOString(),
          end: new Date(slotStart + durationMs).toISOString(),
        });
        slotStart += durationMs;
      }
    }
    cursor = Math.max(cursor, busy.end);
  }

  // After last busy slot
  let slotStart = cursor;
  while (slotStart + durationMs <= endTime) {
    available.push({
      start: new Date(slotStart).toISOString(),
      end: new Date(slotStart + durationMs).toISOString(),
    });
    slotStart += durationMs;
  }

  return available;
}

export async function bookAppointment(orgId: string, input: {
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  start: string;
  end: string;
  title?: string;
  notes?: string;
  callId?: string;
}) {
  const org = await getCalendarConfig(orgId);
  if (!org) throw new ExternalServiceError("Calendar", "Organisation not found");

  let externalEventId: string | undefined;
  let provider: "google" | "outlook" | "ghl" = "ghl";

  const summary = input.title ?? `Appointment with ${input.contactName}`;

  if (org.calendar_type === "google" && org.calendar_credentials_encrypted) {
    const calendarId = org.calendar_id ?? "primary";
    const event = await googleClient.createEvent(orgId, calendarId, {
      summary,
      start: input.start,
      end: input.end,
      description: input.notes,
      attendees: input.contactEmail ? [{ email: input.contactEmail }] : undefined,
    });
    externalEventId = event.id;
    provider = "google";
  } else if (org.calendar_type === "outlook" && org.calendar_credentials_encrypted) {
    const event = await outlookClient.createEvent(orgId, org.calendar_id ?? "primary", {
      summary,
      start: input.start,
      end: input.end,
      description: input.notes,
      attendees: input.contactEmail ? [{ email: input.contactEmail }] : undefined,
    });
    externalEventId = event.id;
    provider = "outlook";
  } else if (org.ghl_access_token_encrypted && org.ghl_location_id && org.calendar_id) {
    // Book via GHL calendar
    await ghlClient.bookAppointment(orgId, org.calendar_id, {
      contactId: "", // Will be resolved from phone lookup
      startTime: input.start,
      endTime: input.end,
      title: summary,
      notes: input.notes,
    });
    provider = "ghl";
  }

  // Save to appointments table
  const { data: appointment, error } = await supabaseAdmin
    .from("appointments")
    .insert({
      organisation_id: orgId,
      call_id: input.callId,
      external_event_id: externalEventId,
      provider,
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
      contact_email: input.contactEmail,
      start_time: input.start,
      end_time: input.end,
      title: summary,
      notes: input.notes,
      status: "confirmed",
    })
    .select()
    .single();

  if (error) {
    throw new ExternalServiceError("Database", `Failed to save appointment: ${error.message}`);
  }

  return appointment;
}

export async function listCalendars(orgId: string) {
  const org = await getCalendarConfig(orgId);
  if (!org) return [];

  if (org.calendar_type === "google" && org.calendar_credentials_encrypted) {
    return googleClient.listCalendars(orgId);
  } else if (org.calendar_type === "outlook" && org.calendar_credentials_encrypted) {
    return outlookClient.listCalendars(orgId);
  }

  return [];
}

export async function setCalendarId(orgId: string, calendarId: string) {
  await supabaseAdmin
    .from("organisations")
    .update({ calendar_id: calendarId })
    .eq("id", orgId);
}
