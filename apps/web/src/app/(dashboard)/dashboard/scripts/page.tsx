"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { useToast } from "@/components/toast";

interface Script {
  id: string;
  flow_type: string;
  name: string;
  system_prompt: string;
  first_message: string | null;
  is_active: boolean;
  version: number;
  published_at: string | null;
  change_notes: string | null;
}

const flowTypeDescriptions: Record<string, string> = {
  new_inquiry: "How the AI handles calls from potential new clients",
  existing_client: "How the AI handles calls from current clients",
  payment_query: "How the AI handles payment and invoice queries",
  after_hours: "How the AI handles calls outside business hours",
  supplier_subcontractor: "How the AI handles supplier and sub calls",
};

const VARIABLES = [
  { label: "{company_name}", description: "Business name" },
  { label: "{caller_name}", description: "Caller's name" },
  { label: "{builder_name}", description: "Builder/owner name" },
  { label: "{business_hours}", description: "Operating hours" },
];

export default function ScriptsPage() {
  const { toast } = useToast();
  const { data, loading, refetch } = useApi<{ data: Script[] }>("/scripts");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", system_prompt: "", first_message: "" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  function startEdit(script: Script) {
    setEditingId(script.id);
    setForm({
      name: script.name,
      system_prompt: script.system_prompt,
      first_message: script.first_message ?? "",
    });
    setPreview(null);
  }

  function insertVariable(variable: string) {
    const textarea = promptRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newPrompt =
      form.system_prompt.substring(0, start) +
      variable +
      form.system_prompt.substring(end);
    setForm({ ...form, system_prompt: newPrompt });
    // Restore cursor position after variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      await api.put(`/scripts/${id}`, form);
      setEditingId(null);
      setPreview(null);
      toast("Script saved successfully", "success");
      await refetch();
    } catch {
      toast("Failed to save script. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(id: string) {
    try {
      await api.post(`/scripts/${id}/publish`);
      toast("Script published successfully", "success");
      await refetch();
    } catch {
      toast("Failed to publish. Please try again.", "error");
    }
  }

  async function handlePreview(id: string) {
    setLoadingPreview(true);
    try {
      const result = await api.post<{ rendered_prompt: string }>(`/scripts/${id}/preview`);
      setPreview(result.rendered_prompt);
    } catch {
      toast("Failed to generate preview.", "error");
    } finally {
      setLoadingPreview(false);
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
                </div>

                {/* Variable Insertion Toolbar */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-[var(--muted-foreground)] self-center mr-1">Insert:</span>
                  {VARIABLES.map((v) => (
                    <button
                      key={v.label}
                      onClick={() => insertVariable(v.label)}
                      title={v.description}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs font-mono hover:bg-[var(--accent)]"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                {/* Editor + Preview side by side */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">System Prompt</label>
                    <textarea
                      ref={promptRef}
                      value={form.system_prompt}
                      onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                      rows={12}
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium">Preview</label>
                      <button
                        onClick={() => handlePreview(script.id)}
                        disabled={loadingPreview}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        {loadingPreview ? "Loading..." : "Refresh Preview"}
                      </button>
                    </div>
                    <div className="h-[288px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs font-mono whitespace-pre-wrap">
                      {preview ?? "Click 'Refresh Preview' to see the rendered prompt with knowledge base and variables filled in."}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setEditingId(null); setPreview(null); }}
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
                  {script.published_at && (
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      Published: {new Date(script.published_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!script.is_active && (
                    <button
                      onClick={() => handlePublish(script.id)}
                      className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
                    >
                      Publish
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(script)}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)] transition-colors"
                  >
                    Edit
                  </button>
                </div>
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
