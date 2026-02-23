"use client";

import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api-client";

const categories = [
  { id: "services", label: "Services" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
  { id: "process", label: "Process" },
  { id: "team", label: "Team" },
  { id: "area_coverage", label: "Area Coverage" },
  { id: "policies", label: "Policies" },
];

interface KbEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface EntryForm {
  title: string;
  content: string;
}

export default function KnowledgeBasePage() {
  const [activeCategory, setActiveCategory] = useState("services");
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<EntryForm>({ title: "", content: "" });
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<{ data: KbEntry[] }>("/knowledge-base", {
        category: activeCategory,
      });
      setEntries(result.data ?? []);
    } catch {
      // Will show empty state
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleAdd() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      await api.post("/knowledge-base", {
        category: activeCategory,
        title: form.title,
        content: form.content,
      });
      setForm({ title: "", content: "" });
      setShowAdd(false);
      await fetchEntries();
    } catch {
      alert("Failed to add entry. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      await api.put(`/knowledge-base/${id}`, {
        title: form.title,
        content: form.content,
      });
      setEditingId(null);
      setForm({ title: "", content: "" });
      await fetchEntries();
    } catch {
      alert("Failed to update entry. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    try {
      await api.delete(`/knowledge-base/${id}`);
      await fetchEntries();
    } catch {
      alert("Failed to delete entry. Please try again.");
    }
  }

  function startEdit(entry: KbEntry) {
    setEditingId(entry.id);
    setForm({ title: entry.title, content: entry.content });
    setShowAdd(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowAdd(false);
    setForm({ title: "", content: "" });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <button
          onClick={() => {
            setShowAdd(true);
            setEditingId(null);
            setForm({ title: "", content: "" });
          }}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
        >
          Add Entry
        </button>
      </div>

      <div className="flex gap-6">
        {/* Category sidebar */}
        <div className="w-48 shrink-0">
          <nav className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  cancelEdit();
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeCategory === cat.id
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Entries list */}
        <div className="flex-1 space-y-4">
          {/* Add form */}
          {showAdd && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h3 className="font-semibold mb-3">New Entry</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Entry title"
                  className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Enter the information SiteAnswer should know..."
                  rows={4}
                  className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={cancelEdit}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={saving}
                    className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[var(--muted-foreground)]">
              Loading...
            </div>
          ) : entries.length === 0 && !showAdd ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[var(--muted-foreground)]">
              <p>No entries in this category yet.</p>
              <p className="mt-2 text-sm">
                Add information about your {categories.find((c) => c.id === activeCategory)?.label.toLowerCase()} so
                SiteAnswer can answer caller questions accurately.
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6"
              >
                {editingId === entry.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                    <textarea
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                      rows={4}
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={cancelEdit}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdate(entry.id)}
                        disabled={saving}
                        className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Update"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{entry.title}</h3>
                        <p className="mt-2 text-sm text-[var(--muted-foreground)] whitespace-pre-wrap">
                          {entry.content}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-4">
                        <button
                          onClick={() => startEdit(entry)}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent)]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
