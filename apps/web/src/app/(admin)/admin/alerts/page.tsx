"use client";

import { useApi } from "@/hooks/use-api";

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  organisation_id: string;
}

export default function AdminAlertsPage() {
  const { data, loading } = useApi<{ data: Alert[] }>("/admin/alerts");
  const alerts = data?.data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Alerts</h1>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        {loading ? (
          <div className="p-6 text-center text-[var(--muted-foreground)]">Loading alerts...</div>
        ) : alerts.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {alerts.map((alert) => (
              <div key={alert.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${
                        alert.type === "usage_limit_exceeded" ? "bg-red-500" : "bg-yellow-500"
                      }`} />
                      <h3 className="font-medium text-sm">{alert.title}</h3>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{alert.message}</p>
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                    {new Date(alert.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-[var(--muted-foreground)]">
            No active alerts. You&apos;ll see notifications here when members approach
            usage thresholds or when costs need attention.
          </div>
        )}
      </div>
    </div>
  );
}
