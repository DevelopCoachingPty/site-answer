"use client";

import { useApi } from "@/hooks/use-api";

interface UsageRecord {
  id: string;
  total_calls: number | null;
  total_minutes: number | null;
  inbound_calls: number | null;
  outbound_calls: number | null;
  missed_calls: number | null;
  new_contacts_created: number | null;
  appointments_booked: number | null;
  sms_sent: number | null;
  period_start: string;
  period_end: string;
}

interface CallStats {
  today: { total: number; answered: number; missed: number; escalated: number };
  this_week: { leads_captured: number; appointments_booked: number };
  average_duration_seconds: number;
}

export default function AnalyticsPage() {
  const { data: usage } = useApi<{ data: UsageRecord }>("/usage");
  const { data: history } = useApi<{ data: UsageRecord[] }>("/usage/history", { months: 6 });
  const { data: stats } = useApi<CallStats>("/calls/stats");

  const current = usage?.data;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Total Calls This Month</p>
          <p className="mt-2 text-3xl font-bold">{current?.total_calls ?? 0}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Minutes Used</p>
          <p className="mt-2 text-3xl font-bold">
            {Math.round(Number(current?.total_minutes ?? 0))}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">New Contacts</p>
          <p className="mt-2 text-3xl font-bold">{current?.new_contacts_created ?? 0}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Appointments Booked</p>
          <p className="mt-2 text-3xl font-bold">{current?.appointments_booked ?? 0}</p>
        </div>
      </div>

      {/* Detailed breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">This Month Breakdown</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Inbound calls</span>
              <span className="font-medium">{current?.inbound_calls ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Outbound calls</span>
              <span className="font-medium">{current?.outbound_calls ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Missed calls</span>
              <span className="font-medium">{current?.missed_calls ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">SMS sent</span>
              <span className="font-medium">{current?.sms_sent ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Avg. call duration</span>
              <span className="font-medium">
                {stats?.average_duration_seconds
                  ? `${Math.round(stats.average_duration_seconds / 60)} min`
                  : "N/A"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Today&apos;s Activity</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Total calls</span>
              <span className="font-medium">{stats?.today?.total ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Answered</span>
              <span className="font-medium text-green-600">{stats?.today?.answered ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Missed</span>
              <span className="font-medium text-red-600">{stats?.today?.missed ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Escalated</span>
              <span className="font-medium text-yellow-600">{stats?.today?.escalated ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Leads captured this week</span>
              <span className="font-medium">{stats?.this_week?.leads_captured ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-semibold">Monthly History</h2>
        </div>
        {history?.data && history.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Month</th>
                  <th className="px-6 py-3 text-right font-medium text-[var(--muted-foreground)]">Calls</th>
                  <th className="px-6 py-3 text-right font-medium text-[var(--muted-foreground)]">Minutes</th>
                  <th className="px-6 py-3 text-right font-medium text-[var(--muted-foreground)]">Contacts</th>
                  <th className="px-6 py-3 text-right font-medium text-[var(--muted-foreground)]">Appointments</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((record) => (
                  <tr key={record.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-6 py-3">
                      {new Date(record.period_start + "T00:00:00").toLocaleDateString("en-AU", {
                        year: "numeric",
                        month: "long",
                      })}
                    </td>
                    <td className="px-6 py-3 text-right">{record.total_calls ?? 0}</td>
                    <td className="px-6 py-3 text-right">{Math.round(Number(record.total_minutes ?? 0))}</td>
                    <td className="px-6 py-3 text-right">{record.new_contacts_created ?? 0}</td>
                    <td className="px-6 py-3 text-right">{record.appointments_booked ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-[var(--muted-foreground)]">
            No usage history yet.
          </div>
        )}
      </div>
    </div>
  );
}
