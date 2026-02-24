import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { env } from "../../config/env.js";

export async function getOrCreateUsageRecord(orgId: string) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0]!;
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0]!;

  // Try to get existing record
  const { data: existing } = await supabaseAdmin
    .from("usage_tracking")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("period_start", periodStart)
    .single();

  if (existing) return existing;

  // Create new record for this month
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .insert({
      organisation_id: orgId,
      period_start: periodStart,
      period_end: periodEnd,
    })
    .select()
    .single();

  if (error) {
    throw new AppError(500, `Failed to create usage record: ${error.message}`, "DB_ERROR");
  }

  return data;
}

export async function incrementUsage(
  orgId: string,
  increments: {
    calls?: number;
    minutes?: number;
    inbound?: number;
    outbound?: number;
    missed?: number;
    new_contacts?: number;
    appointments?: number;
    sms?: number;
  },
) {
  const record = await getOrCreateUsageRecord(orgId);

  const updates: Record<string, number> = {};
  if (increments.calls) updates.total_calls = (record.total_calls ?? 0) + increments.calls;
  if (increments.minutes) updates.total_minutes = parseFloat(String(record.total_minutes ?? 0)) + increments.minutes;
  if (increments.inbound) updates.inbound_calls = (record.inbound_calls ?? 0) + increments.inbound;
  if (increments.outbound) updates.outbound_calls = (record.outbound_calls ?? 0) + increments.outbound;
  if (increments.missed) updates.missed_calls = (record.missed_calls ?? 0) + increments.missed;
  if (increments.new_contacts) updates.new_contacts_created = (record.new_contacts_created ?? 0) + increments.new_contacts;
  if (increments.appointments) updates.appointments_booked = (record.appointments_booked ?? 0) + increments.appointments;
  if (increments.sms) updates.sms_sent = (record.sms_sent ?? 0) + increments.sms;

  if (Object.keys(updates).length === 0) return record;

  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .update(updates)
    .eq("id", record.id)
    .select()
    .single();

  if (error) {
    throw new AppError(500, `Failed to update usage: ${error.message}`, "DB_ERROR");
  }

  return data;
}

export async function getUsageHistory(orgId: string, months = 6) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("*")
    .eq("organisation_id", orgId)
    .gte("period_start", startDate.toISOString().split("T")[0]!)
    .order("period_start", { ascending: true });

  if (error) {
    throw new AppError(500, `Failed to get usage history: ${error.message}`, "DB_ERROR");
  }

  return data ?? [];
}

export async function getGlobalUsage() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0]!;

  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("*")
    .eq("period_start", periodStart);

  if (error) {
    throw new AppError(500, `Failed to get global usage: ${error.message}`, "DB_ERROR");
  }

  const records = data ?? [];
  const totals = records.reduce(
    (acc, r) => ({
      total_calls: acc.total_calls + (r.total_calls ?? 0),
      total_minutes: acc.total_minutes + parseFloat(String(r.total_minutes ?? 0)),
      new_contacts: acc.new_contacts + (r.new_contacts_created ?? 0),
      member_count: acc.member_count + 1,
    }),
    { total_calls: 0, total_minutes: 0, new_contacts: 0, member_count: 0 },
  );

  const elevenlabsCost = Math.round(totals.total_minutes * env.ELEVENLABS_COST_PER_MIN * 100) / 100;
  const estimatedRevenue = Math.round(totals.total_minutes * env.REBILL_RATE_PER_MIN * 100) / 100;

  return {
    ...totals,
    elevenlabs_cost: elevenlabsCost,
    estimated_revenue: estimatedRevenue,
    net_margin: Math.round((estimatedRevenue - elevenlabsCost) * 100) / 100,
  };
}
