"use client";

import { useApi } from "@/hooks/use-api";

interface GlobalUsage {
  total_calls: number;
  total_minutes: number;
  new_contacts: number;
  member_count: number;
  elevenlabs_cost: number;
  estimated_revenue: number;
  net_margin: number;
}

export default function AdminOverviewPage() {
  const { data: usage, loading } = useApi<GlobalUsage>("/admin/usage");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Overview</h1>

      {/* Global stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Active Members</p>
          <p className="mt-2 text-3xl font-bold">
            {loading ? "-" : usage?.member_count ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Total Minutes (Month)</p>
          <p className="mt-2 text-3xl font-bold">
            {loading ? "-" : Math.round(usage?.total_minutes ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">ElevenLabs Cost</p>
          <p className="mt-2 text-3xl font-bold">
            ${loading ? "-" : usage?.elevenlabs_cost?.toFixed(2) ?? "0.00"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Net Margin</p>
          <p className={`mt-2 text-3xl font-bold ${(usage?.net_margin ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
            ${loading ? "-" : usage?.net_margin?.toFixed(2) ?? "0.00"}
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">This Month Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Total calls</span>
              <span className="font-medium">{usage?.total_calls ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">New contacts</span>
              <span className="font-medium">{usage?.new_contacts ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Est. revenue</span>
              <span className="font-medium">${usage?.estimated_revenue?.toFixed(2) ?? "0.00"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">ElevenLabs cost</span>
              <span className="font-medium">${usage?.elevenlabs_cost?.toFixed(2) ?? "0.00"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-6 py-4">
            <h2 className="font-semibold">Recent Activity</h2>
          </div>
          <div className="p-6 text-center text-[var(--muted-foreground)]">
            Activity feed will populate as members onboard.
          </div>
        </div>
      </div>
    </div>
  );
}
