"use client";

import { useState } from "react";

const categories = [
  { id: "services", label: "Services" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
  { id: "process", label: "Process" },
  { id: "team", label: "Team" },
  { id: "area_coverage", label: "Area Coverage" },
  { id: "policies", label: "Policies" },
];

export default function KnowledgeBasePage() {
  const [activeCategory, setActiveCategory] = useState("services");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
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
                onClick={() => setActiveCategory(cat.id)}
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
        <div className="flex-1">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[var(--muted-foreground)]">
            <p>No entries in this category yet.</p>
            <p className="mt-2 text-sm">
              Add information about your {activeCategory} so SiteAnswer can
              answer caller questions accurately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
