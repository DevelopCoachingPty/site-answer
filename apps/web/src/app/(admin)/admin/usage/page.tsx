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

export default function AdminUsagePage() {
  const { data: usage, loading } = useApi<GlobalUsage>("/admin/usage");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Usage &amp; Billing</h1>

      {/* Cost overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Active Members</p>
          <p className="mt-2 text-3xl font-bold">
            {loading ? "-" : usage?.member_count ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Total Cost (Month)</p>
          <p className="mt-2 text-3xl font-bold">
            ${loading ? "-" : usage?.elevenlabs_cost?.toFixed(2) ?? "0.00"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {Math.round(usage?.total_minutes ?? 0)} min @ ~$0.08/min
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Est. Revenue</p>
          <p className="mt-2 text-3xl font-bold">
            ${loading ? "-" : usage?.estimated_revenue?.toFixed(2) ?? "0.00"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">via GHL phone rebilling</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Net Margin</p>
          <p className={`mt-2 text-3xl font-bold ${(usage?.net_margin ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
            ${loading ? "-" : usage?.net_margin?.toFixed(2) ?? "0.00"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">revenue - costs</p>
        </div>
      </div>

      {/* Usage summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">This Month</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Total calls across all members</span>
              <span className="font-medium">{usage?.total_calls ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Total minutes used</span>
              <span className="font-medium">{Math.round(usage?.total_minutes ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">New contacts created</span>
              <span className="font-medium">{usage?.new_contacts ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Cost Breakdown</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">ElevenLabs API (~$0.08/min)</span>
              <span className="font-medium">${usage?.elevenlabs_cost?.toFixed(2) ?? "0.00"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Phone rebilling (~$0.16/min)</span>
              <span className="font-medium text-green-600">${usage?.estimated_revenue?.toFixed(2) ?? "0.00"}</span>
            </div>
            <div className="border-t border-[var(--border)] pt-2 flex justify-between text-sm font-medium">
              <span>Net margin</span>
              <span className={(usage?.net_margin ?? 0) >= 0 ? "text-green-600" : "text-red-600"}>
                ${usage?.net_margin?.toFixed(2) ?? "0.00"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
