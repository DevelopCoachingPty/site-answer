export default function AdminAlertsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Alerts</h1>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="p-6 text-center text-[var(--muted-foreground)]">
          No active alerts. You&apos;ll see notifications here when members approach
          usage thresholds or when costs need attention.
        </div>
      </div>
    </div>
  );
}
