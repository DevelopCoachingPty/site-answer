import { supabaseAdmin } from "../../lib/supabase.js";
import { NotFoundError } from "../../lib/errors.js";

interface CallFilters {
  page: number;
  limit: number;
  status?: string;
  flow_type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export async function listCalls(orgId: string, filters: CallFilters) {
  let query = supabaseAdmin
    .from("calls")
    .select("*", { count: "exact" })
    .eq("organisation_id", orgId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.flow_type) {
    query = query.eq("flow_type", filters.flow_type);
  }
  if (filters.date_from) {
    query = query.gte("started_at", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("started_at", filters.date_to);
  }
  if (filters.search) {
    query = query.or(
      `caller_name.ilike.%${filters.search}%,caller_number.ilike.%${filters.search}%,summary.ilike.%${filters.search}%`,
    );
  }

  const from = (filters.page - 1) * filters.limit;
  const to = from + filters.limit - 1;

  const { data, error, count } = await query
    .order("started_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Failed to list calls: ${error.message}`);
  }

  return {
    data: data ?? [],
    total: count ?? 0,
    page: filters.page,
    limit: filters.limit,
    total_pages: Math.ceil((count ?? 0) / filters.limit),
  };
}

export async function getCall(orgId: string, callId: string) {
  const { data: call, error } = await supabaseAdmin
    .from("calls")
    .select("*")
    .eq("id", callId)
    .eq("organisation_id", orgId)
    .single();

  if (error || !call) {
    throw new NotFoundError("Call", callId);
  }

  // Get associated actions
  const { data: actions } = await supabaseAdmin
    .from("call_actions")
    .select("*")
    .eq("call_id", callId)
    .order("created_at", { ascending: true });

  return { ...call, actions: actions ?? [] };
}

export async function createCall(input: {
  organisation_id: string;
  external_call_id?: string;
  direction: string;
  caller_number?: string;
  called_number?: string;
  caller_name?: string;
  flow_type?: string;
  ghl_contact_id?: string;
  is_new_contact?: boolean;
}) {
  const { data, error } = await supabaseAdmin
    .from("calls")
    .insert({
      ...input,
      status: "ringing",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create call: ${error.message}`);
  }

  return data;
}

export async function updateCall(callId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("calls")
    .update(updates)
    .eq("id", callId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update call: ${error.message}`);
  }

  return data;
}

export async function getCallStats(orgId: string) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();

  // Today's calls
  const { data: todayCalls } = await supabaseAdmin
    .from("calls")
    .select("status, flow_type")
    .eq("organisation_id", orgId)
    .gte("started_at", todayStart);

  const today = {
    total: todayCalls?.length ?? 0,
    answered: todayCalls?.filter((c) => c.status === "completed").length ?? 0,
    missed: todayCalls?.filter((c) => c.status === "missed").length ?? 0,
    escalated: todayCalls?.filter((c) => c.status === "completed" && c.flow_type === "unknown").length ?? 0,
  };

  // This week's metrics
  const { data: weekCalls } = await supabaseAdmin
    .from("calls")
    .select("is_new_contact, duration_seconds")
    .eq("organisation_id", orgId)
    .gte("started_at", weekStart);

  const { count: weekBookings } = await supabaseAdmin
    .from("call_actions")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", orgId)
    .eq("action_type", "book_appointment")
    .gte("created_at", weekStart);

  const durations = weekCalls
    ?.map((c) => c.duration_seconds)
    .filter((d): d is number => d !== null) ?? [];
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return {
    today,
    this_week: {
      leads_captured: weekCalls?.filter((c) => c.is_new_contact).length ?? 0,
      appointments_booked: weekBookings ?? 0,
    },
    average_duration_seconds: avgDuration,
  };
}

export async function createCallAction(input: {
  call_id: string;
  organisation_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("call_actions")
    .insert({
      ...input,
      status: input.status ?? "completed",
      attempted_at: new Date().toISOString(),
      completed_at: input.status === "completed" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create call action: ${error.message}`);
  }

  return data;
}
