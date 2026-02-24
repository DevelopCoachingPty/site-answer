"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/toast";
import { formatDuration } from "@/lib/utils";

interface ChaseCall {
  id: string;
  status: string;
  direction: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  sentiment: string | null;
}

interface ChaseItem {
  id: string;
  organisation_id: string;
  contact_name: string;
  contact_phone: string;
  ghl_contact_id: string;
  invoice_reference: string | null;
  amount_due: number | null;
  due_date: string | null;
  days_overdue: number | null;
  chase_count: number;
  max_chases: number;
  status: string;
  promise_date: string | null;
  notes: string | null;
  next_chase_at: string | null;
  last_chase_at: string | null;
  created_at: string;
  updated_at: string;
  calls: ChaseCall[];
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  promised: "bg-purple-100 text-purple-800",
  paid: "bg-green-100 text-green-800",
  disputed: "bg-red-100 text-red-800",
  escalated: "bg-orange-100 text-orange-800",
};

function formatCurrency(amount: number | null) {
  if (amount === null || amount === undefined) return "-";
  return `$${Number(amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
}

export default function ChaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const { data: response, loading, refetch } = useApi<{ data: ChaseItem }>(
    `/payment-chase/${params.id}`,
  );
  const item = response?.data;

  async function updateStatus(status: string) {
    setUpdating(true);
    try {
      await api.patch(`/payment-chase/${params.id}`, { status });
      refetch();
    } catch {
      toast("Failed to update status. Please try again.", "error");
    } finally {
      setUpdating(false);
    }
  }

  async function handleChaseNow() {
    try {
      await api.post(`/payment-chase/${params.id}/chase-now`);
      refetch();
    } catch {
      toast("Failed to trigger chase. Please try again.", "error");
    }
  }

  async function saveNotes() {
    setUpdating(true);
    try {
      await api.patch(`/payment-chase/${params.id}`, { notes: editNotes });
      setShowNotes(false);
      refetch();
    } catch {
      toast("Failed to save notes. Please try again.", "error");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this chase item?")) return;
    try {
      await api.delete(`/payment-chase/${params.id}`);
      router.push("/dashboard/payment-chase");
    } catch {
      toast("Failed to delete chase item. Please try again.", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[var(--muted-foreground)]">Loading...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[var(--muted-foreground)]">Chase item not found.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/dashboard/payment-chase" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Payment Chasing
        </Link>
        <span className="mx-2 text-[var(--muted-foreground)]">/</span>
        <span className="text-sm font-medium">{item.contact_name}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{item.contact_name}</h1>
          <p className="text-[var(--muted-foreground)]">{item.contact_phone}</p>
        </div>
        <div className="flex gap-2">
          {["pending", "promised", "in_progress"].includes(item.status) && (
            <button
              onClick={handleChaseNow}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Chase Now
            </button>
          )}
          <button
            onClick={handleDelete}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Detail Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--muted-foreground)]">Invoice Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Reference</dt>
              <dd className="font-medium">{item.invoice_reference ?? "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Amount Due</dt>
              <dd className="font-medium">{formatCurrency(item.amount_due)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Due Date</dt>
              <dd>{item.due_date ? new Date(item.due_date).toLocaleDateString() : "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Days Overdue</dt>
              <dd className={item.days_overdue && item.days_overdue > 30 ? "font-medium text-red-600" : ""}>
                {item.days_overdue ?? "-"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--muted-foreground)]">Chase Status</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Status</dt>
              <dd>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[item.status] ?? "bg-gray-100 text-gray-800"}`}>
                  {item.status.replace(/_/g, " ")}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Chase Count</dt>
              <dd>{item.chase_count} / {item.max_chases}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Last Chase</dt>
              <dd>{item.last_chase_at ? new Date(item.last_chase_at).toLocaleString() : "Never"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Next Chase</dt>
              <dd>{item.next_chase_at ? new Date(item.next_chase_at).toLocaleString() : "-"}</dd>
            </div>
            {item.promise_date && (
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">Promise Date</dt>
                <dd className="font-medium text-purple-600">
                  {new Date(item.promise_date).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--muted-foreground)]">Actions</h3>
          <div className="space-y-2">
            <button
              disabled={updating || item.status === "paid"}
              onClick={() => updateStatus("paid")}
              className="w-full rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Mark Paid
            </button>
            <button
              disabled={updating || item.status === "escalated"}
              onClick={() => updateStatus("escalated")}
              className="w-full rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              Escalate
            </button>
            <button
              onClick={() => { setEditNotes(item.notes ?? ""); setShowNotes(true); }}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--accent)]"
            >
              Edit Notes
            </button>
          </div>
        </div>
      </div>

      {/* Notes Editor */}
      {showNotes && (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-2 text-sm font-medium">Notes</h3>
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={saveNotes}
              disabled={updating}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setShowNotes(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notes Display */}
      {!showNotes && item.notes && (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--muted-foreground)]">Notes</h3>
          <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}

      {/* Call History */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-6 py-3">
          <h3 className="font-medium">Chase Call History</h3>
        </div>
        {item.calls.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {item.calls.map((call) => (
              <div key={call.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <Link href={`/dashboard/calls/${call.id}`} className="text-sm font-medium hover:underline">
                    {new Date(call.started_at).toLocaleString()}
                  </Link>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {call.direction} - {formatDuration(call.duration_seconds ?? 0)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {call.sentiment && (
                    <span className="text-xs text-[var(--muted-foreground)]">{call.sentiment}</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[call.status] ?? "bg-gray-100 text-gray-800"}`}>
                    {call.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-sm text-[var(--muted-foreground)]">
            No chase calls have been made yet.
          </div>
        )}
      </div>
    </div>
  );
}
