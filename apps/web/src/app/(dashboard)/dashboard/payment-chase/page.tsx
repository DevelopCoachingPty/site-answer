"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api-client";

interface ChaseItem {
  id: string;
  contact_name: string;
  contact_phone: string;
  invoice_reference: string | null;
  amount_due: number | null;
  due_date: string | null;
  days_overdue: number | null;
  chase_count: number;
  max_chases: number;
  status: string;
  next_chase_at: string | null;
  notes: string | null;
  created_at: string;
}

interface ChaseListResponse {
  data: ChaseItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface ChaseStats {
  pending: number;
  promised: number;
  in_progress: number;
  paid: number;
  disputed: number;
  escalated: number;
  total: number;
  outstanding_value: number;
  recovered_value: number;
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

export default function PaymentChasePage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const params: Record<string, string | number | undefined> = { page, limit: 20 };
  if (statusFilter) params.status = statusFilter;
  if (searchTerm) params.search = searchTerm;

  const { data, loading, refetch } = useApi<ChaseListResponse>("/payment-chase", params);
  const { data: stats } = useApi<ChaseStats>("/payment-chase/stats");

  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    invoice_reference: "",
    amount_due: "",
    due_date: "",
    notes: "",
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/payment-chase", {
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        invoice_reference: form.invoice_reference || undefined,
        amount_due: form.amount_due ? Number(form.amount_due) : undefined,
        due_date: form.due_date || undefined,
        notes: form.notes || undefined,
      });
      setForm({ contact_name: "", contact_phone: "", invoice_reference: "", amount_due: "", due_date: "", notes: "" });
      setShowAddForm(false);
      refetch();
    } catch {
      // Error handled by api client
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChaseNow(id: string) {
    try {
      await api.post(`/payment-chase/${id}/chase-now`);
      refetch();
    } catch {
      // Error handled by api client
    }
  }

  return (
    <div>
      {/* Stats Cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Pending</p>
            <p className="text-2xl font-bold">{stats.pending}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Outstanding Value</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.outstanding_value)}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Promised</p>
            <p className="text-2xl font-bold">{stats.promised}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Recovered</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.recovered_value)}</p>
          </div>
        </div>
      )}

      {/* Header + Actions */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Payment Chasing</h1>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="promised">Promised</option>
            <option value="paid">Paid</option>
            <option value="disputed">Disputed</option>
            <option value="escalated">Escalated</option>
          </select>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
          >
            Add Chase Item
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="mb-4 text-lg font-semibold">Add Chase Item</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Contact Name *</label>
              <input
                required
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Phone Number *</label>
              <input
                required
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Invoice Reference</label>
              <input
                value={form.invoice_reference}
                onChange={(e) => setForm({ ...form, invoice_reference: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Amount Due</label>
              <input
                type="number"
                step="0.01"
                value={form.amount_due}
                onChange={(e) => setForm({ ...form, amount_due: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Item"}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Chase Queue Table */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Contact</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Phone</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Invoice</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Amount</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Due Date</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Chases</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Next Chase</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-[var(--muted-foreground)]">
                    Loading chase items...
                  </td>
                </tr>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent)]/50">
                    <td className="px-6 py-3">
                      <Link href={`/dashboard/payment-chase/${item.id}`} className="font-medium hover:underline">
                        {item.contact_name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">{item.contact_phone}</td>
                    <td className="px-6 py-3">{item.invoice_reference ?? "-"}</td>
                    <td className="px-6 py-3 whitespace-nowrap">{formatCurrency(item.amount_due)}</td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {item.due_date ? new Date(item.due_date).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-6 py-3">
                      {item.chase_count}/{item.max_chases}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[item.status] ?? "bg-gray-100 text-gray-800"}`}>
                        {item.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-[var(--muted-foreground)]">
                      {item.next_chase_at ? new Date(item.next_chase_at).toLocaleString() : "-"}
                    </td>
                    <td className="px-6 py-3">
                      {["pending", "promised", "in_progress"].includes(item.status) && (
                        <button
                          onClick={() => handleChaseNow(item.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Chase Now
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-[var(--muted-foreground)]">
                    No chase items yet. Add one above or sync from your accounting software.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Page {data.page} of {data.total_pages} ({data.total} total items)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
