"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { formatDuration } from "@/lib/utils";
import { CardSkeleton, TableSkeleton } from "@/components/skeleton";

interface CallStats {
  today: { total: number; answered: number; missed: number; escalated: number };
  this_week: { leads_captured: number; appointments_booked: number };
  average_duration_seconds: number;
}

interface Call {
  id: string;
  caller_name: string | null;
  caller_number: string | null;
  flow_type: string | null;
  duration_seconds: number | null;
  status: string;
  summary: string | null;
  started_at: string;
}

interface CallsResponse {
  data: Call[];
  total: number;
}

export default function DashboardPage() {
  const [range, setRange] = useState<string>("week");
  const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useApi<CallStats>("/calls/stats", { range });
  const { data: recentCalls, loading: callsLoading, error: callsError, refetch: refetchCalls } = useApi<CallsResponse>("/calls", { limit: 5 });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-0.5">
          {[
            { value: "week", label: "This Week" },
            { value: "month", label: "This Month" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                range === opt.value
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : statsError ? (
        <div className="rounded-lg border border-[var(--destructive)] bg-red-50 p-6 mb-8 text-center">
          <p className="text-sm text-[var(--destructive)]">Failed to load stats</p>
          <button onClick={refetchStats} className="mt-2 text-sm text-[var(--primary)] hover:underline">Try again</button>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Today&apos;s Calls</p>
          <p className="mt-2 text-3xl font-bold">{stats?.today?.total ?? 0}</p>
          <p className="mt-1 text-sm text-green-600">
            {stats?.today?.answered ?? 0} answered
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Leads {range === "month" ? "This Month" : "This Week"}</p>
          <p className="mt-2 text-3xl font-bold">
            {stats?.this_week?.leads_captured ?? 0}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">new contacts</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Avg. Duration</p>
          <p className="mt-2 text-3xl font-bold">
            {formatDuration(stats?.average_duration_seconds ?? 0)}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">minutes</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Missed Calls</p>
          <p className="mt-2 text-3xl font-bold">{stats?.today?.missed ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">today</p>
        </div>
      </div>
      )}

      {/* Recent calls */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-semibold">Recent Calls</h2>
        </div>
        {callsLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Time</th>
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Caller</th>
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Type</th>
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Duration</th>
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Summary</th>
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={3} cols={5} />
              </tbody>
            </table>
          </div>
        ) : callsError ? (
          <div className="p-6 text-center">
            <p className="text-sm text-[var(--destructive)]">Failed to load recent calls</p>
            <button onClick={refetchCalls} className="mt-2 text-sm text-[var(--primary)] hover:underline">Try again</button>
          </div>
        ) : recentCalls?.data && recentCalls.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Time</th>
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Caller</th>
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Type</th>
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Duration</th>
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Summary</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.data.map((call) => (
                  <tr key={call.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-6 py-3 whitespace-nowrap">
                      {new Date(call.started_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      {call.caller_name ?? call.caller_number ?? "Unknown"}
                    </td>
                    <td className="px-6 py-3">
                      <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs">
                        {call.flow_type?.replace(/_/g, " ") ?? "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-3">{formatDuration(call.duration_seconds ?? 0)}</td>
                    <td className="px-6 py-3 max-w-xs truncate text-[var(--muted-foreground)]">
                      {call.summary ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-[var(--muted-foreground)]">
            <p>No calls yet. Once SiteAnswer is active, call history will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
