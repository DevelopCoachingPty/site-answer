export default function AdminOrganisationsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organisations</h1>
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90">
          Onboard Member
        </button>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Organisation</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Builder</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Calls (Month)</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Minutes</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-[var(--muted-foreground)]">
                  No organisations yet. Click &quot;Onboard Member&quot; to add the first one.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
