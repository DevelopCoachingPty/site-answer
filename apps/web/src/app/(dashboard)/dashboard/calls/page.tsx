export default function CallsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Call Log</h1>
        <div className="flex gap-2">
          {/* TODO: Add filters */}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Time</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Caller</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Type</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Duration</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Summary</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-[var(--muted-foreground)]">
                  No calls recorded yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
