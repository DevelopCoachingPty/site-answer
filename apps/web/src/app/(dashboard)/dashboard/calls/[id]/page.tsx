export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Call Detail</h1>
      <p className="text-[var(--muted-foreground)]">Call ID: {id}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Call info */}
        <div className="lg:col-span-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Call Info</h2>
          {/* TODO: Call metadata, recording player */}
          <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
        </div>

        {/* Transcript */}
        <div className="lg:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Transcript</h2>
          {/* TODO: Chat-style transcript viewer */}
          <p className="text-sm text-[var(--muted-foreground)]">No transcript available.</p>
        </div>
      </div>
    </div>
  );
}
