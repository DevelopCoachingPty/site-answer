export default function AdminUsagePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Usage &amp; Billing</h1>

      {/* Cost overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">ElevenLabs Balance</p>
          <p className="mt-2 text-3xl font-bold">13,750</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">minutes remaining</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Total Cost (Month)</p>
          <p className="mt-2 text-3xl font-bold">$0</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">ElevenLabs + overheads</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Net Margin (Month)</p>
          <p className="mt-2 text-3xl font-bold">$0</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">revenue - costs</p>
        </div>
      </div>

      {/* Per-member usage table */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-semibold">Per-Member Usage</h2>
        </div>
        <div className="p-6 text-center text-[var(--muted-foreground)]">
          No usage data yet.
        </div>
      </div>
    </div>
  );
}
