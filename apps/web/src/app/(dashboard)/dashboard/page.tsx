export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Today&apos;s Calls</p>
          <p className="mt-2 text-3xl font-bold">0</p>
          <p className="mt-1 text-sm text-green-600">0 answered</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Leads This Week</p>
          <p className="mt-2 text-3xl font-bold">0</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">new contacts</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Avg. Duration</p>
          <p className="mt-2 text-3xl font-bold">0:00</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">minutes</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Escalations</p>
          <p className="mt-2 text-3xl font-bold">0</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">this week</p>
        </div>
      </div>

      {/* Recent calls */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-semibold">Recent Calls</h2>
        </div>
        <div className="p-6 text-center text-[var(--muted-foreground)]">
          <p>No calls yet. Once SiteAnswer is active, your call history will appear here.</p>
        </div>
      </div>
    </div>
  );
}
