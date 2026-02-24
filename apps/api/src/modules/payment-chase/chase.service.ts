import { supabaseAdmin } from "../../lib/supabase.js";
import { NotFoundError, ExternalServiceError } from "../../lib/errors.js";

interface ChaseFilters {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export async function listChaseItems(orgId: string, filters: ChaseFilters) {
  let query = supabaseAdmin
    .from("payment_chase_queue")
    .select("*", { count: "exact" })
    .eq("organisation_id", orgId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.search) {
    const s = filters.search.replace(/[%_\\(),."]/g, "");
    if (s) {
      query = query.or(
        `contact_name.ilike.%${s}%,contact_phone.ilike.%${s}%,invoice_reference.ilike.%${s}%`,
      );
    }
  }
  if (filters.date_from) {
    query = query.gte("created_at", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("created_at", filters.date_to);
  }

  const from = (filters.page - 1) * filters.limit;
  const to = from + filters.limit - 1;

  const { data, error, count } = await query
    .order("next_chase_at", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (error) {
    throw new ExternalServiceError("Database", `Failed to list chase items: ${error.message}`);
  }

  return {
    data: data ?? [],
    total: count ?? 0,
    page: filters.page,
    limit: filters.limit,
    total_pages: Math.ceil((count ?? 0) / filters.limit),
  };
}

export async function getChaseItem(orgId: string, itemId: string) {
  const { data: item, error } = await supabaseAdmin
    .from("payment_chase_queue")
    .select("*")
    .eq("id", itemId)
    .eq("organisation_id", orgId)
    .single();

  if (error || !item) {
    throw new NotFoundError("Chase item", itemId);
  }

  // Get linked calls
  const { data: calls } = await supabaseAdmin
    .from("calls")
    .select("id, status, direction, started_at, ended_at, duration_seconds, summary, sentiment")
    .eq("chase_queue_id", itemId)
    .order("started_at", { ascending: false });

  return { ...item, calls: calls ?? [] };
}

export async function createChaseItem(orgId: string, input: {
  ghl_contact_id?: string;
  contact_name: string;
  contact_phone: string;
  invoice_reference?: string;
  amount_due?: number;
  days_overdue?: number;
  due_date?: string;
  max_chases?: number;
  notes?: string;
  external_invoice_id?: string;
  accounting_provider?: string;
}) {
  const nextChaseAt = new Date();
  nextChaseAt.setHours(nextChaseAt.getHours() + 1); // First chase in 1 hour

  const { data, error } = await supabaseAdmin
    .from("payment_chase_queue")
    .insert({
      organisation_id: orgId,
      ghl_contact_id: input.ghl_contact_id ?? "manual",
      contact_name: input.contact_name,
      contact_phone: input.contact_phone,
      invoice_reference: input.invoice_reference,
      amount_due: input.amount_due,
      days_overdue: input.days_overdue,
      due_date: input.due_date,
      max_chases: input.max_chases ?? 3,
      notes: input.notes,
      external_invoice_id: input.external_invoice_id,
      accounting_provider: input.accounting_provider,
      next_chase_at: nextChaseAt.toISOString(),
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw new ExternalServiceError("Database", `Failed to create chase item: ${error.message}`);
  }

  return data;
}

export async function bulkCreateChaseItems(orgId: string, items: Array<{
  ghl_contact_id?: string;
  contact_name: string;
  contact_phone: string;
  invoice_reference?: string;
  amount_due?: number;
  days_overdue?: number;
  due_date?: string;
  max_chases?: number;
  notes?: string;
  external_invoice_id?: string;
  accounting_provider?: string;
}>) {
  const nextChaseAt = new Date();
  nextChaseAt.setHours(nextChaseAt.getHours() + 1);

  const rows = items.map((item) => ({
    organisation_id: orgId,
    ghl_contact_id: item.ghl_contact_id ?? "manual",
    contact_name: item.contact_name,
    contact_phone: item.contact_phone,
    invoice_reference: item.invoice_reference,
    amount_due: item.amount_due,
    days_overdue: item.days_overdue,
    due_date: item.due_date,
    max_chases: item.max_chases ?? 3,
    notes: item.notes,
    external_invoice_id: item.external_invoice_id,
    accounting_provider: item.accounting_provider,
    next_chase_at: nextChaseAt.toISOString(),
    status: "pending" as const,
  }));

  const { data, error } = await supabaseAdmin
    .from("payment_chase_queue")
    .insert(rows)
    .select();

  if (error) {
    throw new ExternalServiceError("Database", `Failed to bulk create chase items: ${error.message}`);
  }

  return data ?? [];
}

export async function updateChaseItem(orgId: string, itemId: string, updates: {
  status?: string;
  notes?: string;
  promise_date?: string;
  max_chases?: number;
  next_chase_at?: string;
}) {
  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from("payment_chase_queue")
    .select("id")
    .eq("id", itemId)
    .eq("organisation_id", orgId)
    .single();

  if (!existing) {
    throw new NotFoundError("Chase item", itemId);
  }

  const { data, error } = await supabaseAdmin
    .from("payment_chase_queue")
    .update(updates)
    .eq("id", itemId)
    .select()
    .single();

  if (error) {
    throw new ExternalServiceError("Database", `Failed to update chase item: ${error.message}`);
  }

  return data;
}

export async function deleteChaseItem(orgId: string, itemId: string) {
  const { error } = await supabaseAdmin
    .from("payment_chase_queue")
    .delete()
    .eq("id", itemId)
    .eq("organisation_id", orgId);

  if (error) {
    throw new ExternalServiceError("Database", `Failed to delete chase item: ${error.message}`);
  }
}

export async function getItemsDueForChasing() {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("payment_chase_queue")
    .select("*, organisations!inner(id, name, elevenlabs_agent_id, phone_number)")
    .in("status", ["pending", "promised"])
    .lte("next_chase_at", now)
    .order("next_chase_at", { ascending: true });

  if (error) {
    throw new ExternalServiceError("Database", `Failed to get items due for chasing: ${error.message}`);
  }

  // Filter out items that have reached their max chase count
  return (data ?? []).filter(
    (item: Record<string, unknown>) =>
      (item.chase_count as number) < (item.max_chases as number),
  );
}

export async function getChaseStats(orgId: string) {
  const { data: items, error } = await supabaseAdmin
    .from("payment_chase_queue")
    .select("status, amount_due")
    .eq("organisation_id", orgId);

  if (error) {
    throw new ExternalServiceError("Database", `Failed to get chase stats: ${error.message}`);
  }

  const all = items ?? [];

  const pending = all.filter((i) => i.status === "pending").length;
  const promised = all.filter((i) => i.status === "promised").length;
  const inProgress = all.filter((i) => i.status === "in_progress").length;
  const paid = all.filter((i) => i.status === "paid").length;
  const disputed = all.filter((i) => i.status === "disputed").length;
  const escalated = all.filter((i) => i.status === "escalated").length;

  const outstandingValue = all
    .filter((i) => ["pending", "promised", "in_progress"].includes(i.status))
    .reduce((sum, i) => sum + (Number(i.amount_due) || 0), 0);

  const recoveredValue = all
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + (Number(i.amount_due) || 0), 0);

  return {
    pending,
    promised,
    in_progress: inProgress,
    paid,
    disputed,
    escalated,
    total: all.length,
    outstanding_value: outstandingValue,
    recovered_value: recoveredValue,
  };
}

export function calculateNextChaseDate(chaseCount: number): Date {
  const now = new Date();
  // Escalating schedule: 1 day, 3 days, 7 days, 14 days, 30 days
  const daysMap = [1, 3, 7, 14, 30];
  const daysToAdd = daysMap[Math.min(chaseCount, daysMap.length - 1)]!;
  now.setDate(now.getDate() + daysToAdd);
  return now;
}

export async function recordChaseAttempt(
  itemId: string,
  callId: string,
  chaseCount: number,
) {
  const nextChaseAt = calculateNextChaseDate(chaseCount);

  const { error } = await supabaseAdmin
    .from("payment_chase_queue")
    .update({
      chase_count: chaseCount + 1,
      last_chase_at: new Date().toISOString(),
      next_chase_at: nextChaseAt.toISOString(),
      last_call_id: callId,
      status: "in_progress",
    })
    .eq("id", itemId);

  if (error) {
    throw new ExternalServiceError("Database", `Failed to record chase attempt: ${error.message}`);
  }
}
