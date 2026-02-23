"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";

interface Script {
  id: string;
  flow_type: string;
  name: string;
  system_prompt: string;
  first_message: string | null;
  is_active: boolean;
  version: number;
}

const flowTypeDescriptions: Record<string, string> = {
  new_inquiry: "How the AI handles calls from potential new clients",
  existing_client: "How the AI handles calls from current clients",
  payment_query: "How the AI handles payment and invoice queries",
  after_hours: "How the AI handles calls outside business hours",
  supplier_subcontractor: "How the AI handles supplier and sub calls",
};

export default function ScriptsPage() {
  const { data, loading, refetch } = useApi<{ data: Script[] }>("/scripts");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", system_prompt: "", first_message: "" });
  const [saving, setSaving] = useState(false);

  function startEdit(script: Script) {
    setEditingId(script.id);
    setForm({
      name: script.name,
      system_prompt: script.system_prompt,
      first_message: script.first_message ?? "",
    });
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      await api.put(`/scripts/${id}`, form);
      setEditingId(null);
      await refetch();
    } catch {
      alert("Failed to save script. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[var(--muted-foreground)]">Loading scripts...</p>
      </div>
    );
  }

  const scripts = data?.data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Conversation Scripts</h1>
      <p className="mb-6 text-[var(--muted-foreground)]">
        Configure how SiteAnswer handles different types of calls. Each script
        controls the AI&apos;s personality, questions, and actions for that call type.
      </p>

      <div className="space-y-4">
        {scripts.map((script) => (
          <div
            key={script.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6"
          >
            {editingId === script.id ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Script Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">First Message</label>
                  <input
                    type="text"
                    value={form.first_message}
                    onChange={(e) => setForm({ ...form, first_message: e.target.value })}
                    placeholder="The AI's opening greeting"
                    className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Use {"{company_name}"} and {"{caller_name}"} as placeholders.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">System Prompt</label>
                  <textarea
                    value={form.system_prompt}
                    onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                    rows={10}
                    className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                  />
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Instructions for the AI. This controls the conversation flow, tone, and what questions to ask.
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSave(script.id)}
                    disabled={saving}
                    className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Script"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{script.name}</h3>
                    <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs">
                      v{script.version}
                    </span>
                    {script.is_active && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {flowTypeDescriptions[script.flow_type] ?? script.flow_type}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(script)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)] transition-colors"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}

        {scripts.length === 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[var(--muted-foreground)]">
            <p>No scripts configured yet. Default scripts will be created when your account is set up.</p>
          </div>
        )}
      </div>
    </div>
  );
}
