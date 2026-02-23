const scriptTypes = [
  { id: "new_inquiry", label: "New Inquiry", description: "How the AI handles calls from potential new clients" },
  { id: "existing_client", label: "Existing Client", description: "How the AI handles calls from current clients" },
  { id: "payment_query", label: "Payment / Accounts", description: "How the AI handles payment and invoice queries" },
  { id: "after_hours", label: "After Hours", description: "How the AI handles calls outside business hours" },
  { id: "supplier_subcontractor", label: "Supplier / Subcontractor", description: "How the AI handles supplier and sub calls" },
];

export default function ScriptsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Conversation Scripts</h1>
      <p className="mb-6 text-[var(--muted-foreground)]">
        Configure how SiteAnswer handles different types of calls. Each script
        controls the AI&apos;s personality, questions, and actions for that call type.
      </p>

      <div className="space-y-4">
        {scriptTypes.map((script) => (
          <div
            key={script.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{script.label}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {script.description}
                </p>
              </div>
              <button className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)] transition-colors">
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
