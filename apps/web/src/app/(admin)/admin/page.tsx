export default function AdminOverviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Overview</h1>

      {/* Global stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Active Members</p>
          <p className="mt-2 text-3xl font-bold">0</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Total Minutes (Month)</p>
          <p className="mt-2 text-3xl font-bold">0</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">ElevenLabs Cost</p>
          <p className="mt-2 text-3xl font-bold">$0</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Est. Rebill Revenue</p>
          <p className="mt-2 text-3xl font-bold">$0</p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-semibold">Recent Activity</h2>
        </div>
        <div className="p-6 text-center text-[var(--muted-foreground)]">
          No activity yet.
        </div>
      </div>
    </div>
  );
}
