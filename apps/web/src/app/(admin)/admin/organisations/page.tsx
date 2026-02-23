"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { useToast } from "@/components/toast";

interface Organisation {
  id: string;
  name: string;
  builder_name: string | null;
  is_active: boolean;
  phone_number: string | null;
  created_at: string;
  users?: { email: string; full_name: string } | null;
}

interface OrgsResponse {
  data: Organisation[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export default function AdminOrganisationsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [showOnboard, setShowOnboard] = useState(false);
  const [onboardForm, setOnboardForm] = useState({
    name: "",
    builder_name: "",
    email: "",
    phone_number: "",
  });
  const [saving, setSaving] = useState(false);

  const { data, loading, refetch } = useApi<OrgsResponse>("/admin/organisations", {
    page,
    limit: 20,
  });

  async function handleOnboard() {
    if (!onboardForm.name || !onboardForm.builder_name || !onboardForm.email) return;
    setSaving(true);
    try {
      await api.post("/admin/organisations", onboardForm);
      setShowOnboard(false);
      setOnboardForm({ name: "", builder_name: "", email: "", phone_number: "" });
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to onboard member", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(orgId: string, isActive: boolean) {
    try {
      await api.put(`/admin/organisations/${orgId}/status`, { is_active: !isActive });
      await refetch();
    } catch {
      toast("Failed to update organisation status", "error");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organisations</h1>
        <button
          onClick={() => setShowOnboard(true)}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Onboard Member
        </button>
      </div>

      {/* Onboard modal */}
      {showOnboard && (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Onboard New Member</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Company Name</label>
              <input
                type="text"
                value={onboardForm.name}
                onChange={(e) => setOnboardForm({ ...onboardForm, name: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Smith Brothers Construction"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Builder Name</label>
              <input
                type="text"
                value={onboardForm.builder_name}
                onChange={(e) => setOnboardForm({ ...onboardForm, builder_name: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Dave Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={onboardForm.email}
                onChange={(e) => setOnboardForm({ ...onboardForm, email: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="builder@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number (optional)</label>
              <input
                type="tel"
                value={onboardForm.phone_number}
                onChange={(e) => setOnboardForm({ ...onboardForm, phone_number: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="+61 4XX XXX XXX"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button
              onClick={() => setShowOnboard(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
            >
              Cancel
            </button>
            <button
              onClick={handleOnboard}
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Organisation"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Organisation</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Builder</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Phone</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Created</th>
                <th className="px-6 py-3 text-left font-medium text-[var(--muted-foreground)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--muted-foreground)]">
                    Loading...
                  </td>
                </tr>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((org) => (
                  <tr key={org.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-6 py-3 font-medium">{org.name}</td>
                    <td className="px-6 py-3">{org.builder_name ?? "-"}</td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        org.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        {org.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-3">{org.phone_number ?? "-"}</td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => toggleActive(org.id, org.is_active)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          org.is_active
                            ? "border border-red-200 text-red-600 hover:bg-red-50"
                            : "border border-green-200 text-green-600 hover:bg-green-50"
                        }`}
                      >
                        {org.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--muted-foreground)]">
                    No organisations yet. Click &quot;Onboard Member&quot; to add the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Page {data.page} of {data.total_pages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page === data.total_pages}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
