export default function AnalyticsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Total Calls This Month</p>
          <p className="mt-2 text-3xl font-bold">0</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Minutes Used</p>
          <p className="mt-2 text-3xl font-bold">0</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">New Contacts Created</p>
          <p className="mt-2 text-3xl font-bold">0</p>
        </div>
      </div>

      {/* Charts placeholder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Call Volume</h2>
          <div className="h-64 flex items-center justify-center text-[var(--muted-foreground)]">
            {/* TODO: Recharts line chart */}
            Chart will appear when calls are recorded
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Call Types</h2>
          <div className="h-64 flex items-center justify-center text-[var(--muted-foreground)]">
            {/* TODO: Recharts pie chart */}
            Chart will appear when calls are recorded
          </div>
        </div>
      </div>
    </div>
  );
}
