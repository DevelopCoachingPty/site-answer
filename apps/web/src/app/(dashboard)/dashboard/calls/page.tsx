"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { formatDuration } from "@/lib/utils";

interface Call {
  id: string;
  caller_name: string | null;
  caller_number: string | null;
  flow_type: string | null;
  duration_seconds: number | null;
  status: string;
  summary: string | null;
  sentiment: string | null;
  started_at: string;
}

interface CallsResponse {
  data: Call[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  missed: "bg-red-100 text-red-800",
  in_progress: "bg-blue-100 text-blue-800",
  ringing: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
};

export default function CallsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [flowFilter, setFlowFilter] = useState<string>("");

  const params: Record<string, string | number | undefined> = {
    page,
    limit: 20,
  };
  if (statusFilter) params.status = statusFilter;
  if (flowFilter) params.flow_type = flowFilter;

  const { data, loading } = useApi<CallsResponse>("/calls", params);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Call Log</h1>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="missed">Missed</option>
            <option value="in_progress">In Progress</option>
          </select>
          <select
            value={flowFilter}
            onChange={(e) => { setFlowFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            <option value="new_inquiry">New Inquiry</option>
            <option value="existing_client">Existing Client</option>
            <option value="payment_query">Payment</option>
            <option value="after_hours">After Hours</option>
            <option value="supplier_subcontractor">Supplier</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Time</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Caller</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Type</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Duration</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Summary</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--muted-foreground)]">
                    Loading calls...
                  </td>
                </tr>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((call) => (
                  <tr key={call.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent)]/50">
                    <td className="px-6 py-3 whitespace-nowrap">
                      <Link href={`/dashboard/calls/${call.id}`} className="hover:underline">
                        {new Date(call.started_at).toLocaleString()}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      {call.caller_name ?? call.caller_number ?? "Unknown"}
                    </td>
                    <td className="px-6 py-3">
                      <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs capitalize">
                        {call.flow_type?.replace(/_/g, " ") ?? "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-3">{formatDuration(call.duration_seconds ?? 0)}</td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[call.status] ?? "bg-gray-100 text-gray-800"}`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 max-w-xs truncate text-[var(--muted-foreground)]">
                      {call.summary ?? "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--muted-foreground)]">
                    No calls recorded yet.
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
              Page {data.page} of {data.total_pages} ({data.total} total calls)
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
