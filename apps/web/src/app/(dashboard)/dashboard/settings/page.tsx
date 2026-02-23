"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";

interface Organisation {
  id: string;
  name: string;
  builder_name: string | null;
  greeting_name: string | null;
  phone_number: string | null;
  timezone: string | null;
  business_hours: Record<string, unknown> | null;
  after_hours_action: string | null;
  escalation_phone: string | null;
  escalation_sms: boolean;
  ghl_connected: boolean;
  calendar_connected: boolean;
}

interface AccountingStatus {
  connected: boolean;
  provider?: string;
  last_sync?: {
    status: string;
    invoices_found: number;
    invoices_synced: number;
    completed_at: string;
  } | null;
}

export default function SettingsPage() {
  const { data, loading, refetch } = useApi<{ data: Organisation }>("/organisations");
  const { data: accountingStatus, refetch: refetchAccounting } = useApi<AccountingStatus>("/accounting/status");
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    builder_name: "",
    greeting_name: "",
    phone_number: "",
    timezone: "Australia/Sydney",
    escalation_phone: "",
    escalation_sms: true,
    after_hours_action: "voicemail",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.data) {
      const org = data.data;
      setForm({
        name: org.name ?? "",
        builder_name: org.builder_name ?? "",
        greeting_name: org.greeting_name ?? "",
        phone_number: org.phone_number ?? "",
        timezone: org.timezone ?? "Australia/Sydney",
        escalation_phone: org.escalation_phone ?? "",
        escalation_sms: org.escalation_sms ?? true,
        after_hours_action: org.after_hours_action ?? "voicemail",
      });
    }
  }, [data]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch("/organisations", form);
      setSaved(true);
      await refetch();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[var(--muted-foreground)]">Loading settings...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Company Details */}
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Company Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Company Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Smith Brothers Construction"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Builder Name</label>
              <input
                type="text"
                value={form.builder_name}
                onChange={(e) => setForm({ ...form, builder_name: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Dave Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Greeting Name</label>
              <input
                type="text"
                value={form.greeting_name}
                onChange={(e) => setForm({ ...form, greeting_name: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="How the AI should refer to the business"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <input
                type="tel"
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="+61 4XX XXX XXX"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Timezone</label>
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
                <option value="Australia/Melbourne">Australia/Melbourne (AEST/AEDT)</option>
                <option value="Australia/Brisbane">Australia/Brisbane (AEST)</option>
                <option value="Australia/Perth">Australia/Perth (AWST)</option>
                <option value="Australia/Adelaide">Australia/Adelaide (ACST/ACDT)</option>
                <option value="Australia/Darwin">Australia/Darwin (ACST)</option>
                <option value="Australia/Hobart">Australia/Hobart (AEST/AEDT)</option>
                <option value="Pacific/Auckland">New Zealand (NZST/NZDT)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">After Hours Action</label>
              <select
                value={form.after_hours_action}
                onChange={(e) => setForm({ ...form, after_hours_action: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="voicemail">Take a message</option>
                <option value="redirect">Redirect to mobile</option>
                <option value="full_ai">Full AI handling</option>
              </select>
            </div>
          </div>
        </section>

        {/* Business Hours */}
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Business Hours</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Set when calls should be handled with the standard greeting vs. the after-hours script.
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">Business hours editor coming in a future update.</p>
        </section>

        {/* Escalation */}
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Escalation Settings</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Escalation Phone</label>
              <input
                type="tel"
                value={form.escalation_phone}
                onChange={(e) => setForm({ ...form, escalation_phone: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Your mobile number"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="escalation_sms"
                checked={form.escalation_sms}
                onChange={(e) => setForm({ ...form, escalation_sms: e.target.checked })}
              />
              <label htmlFor="escalation_sms" className="text-sm">
                Send SMS for escalations
              </label>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Integrations</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <h3 className="font-medium">GoHighLevel</h3>
                <p className="text-sm text-[var(--muted-foreground)]">CRM integration for contacts and activities</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                data?.data?.ghl_connected
                  ? "bg-green-100 text-green-800"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]"
              }`}>
                {data?.data?.ghl_connected ? "Connected" : "Not connected"}
              </span>
            </div>

            {/* Xero */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <h3 className="font-medium">Xero</h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Sync overdue invoices to payment chase queue
                </p>
                {accountingStatus?.connected && accountingStatus.provider === "xero" && accountingStatus.last_sync && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    Last sync: {new Date(accountingStatus.last_sync.completed_at).toLocaleString()}
                    {" "}({accountingStatus.last_sync.invoices_synced} synced)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {accountingStatus?.connected && accountingStatus.provider === "xero" ? (
                  <>
                    <button
                      onClick={async () => {
                        setSyncing(true);
                        try {
                          await api.post("/accounting/sync");
                          setTimeout(() => refetchAccounting(), 3000);
                        } catch { /* handled */ }
                        finally { setSyncing(false); }
                      }}
                      disabled={syncing}
                      className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--accent)] disabled:opacity-50"
                    >
                      {syncing ? "Syncing..." : "Sync Now"}
                    </button>
                    <button
                      onClick={async () => {
                        await api.delete("/accounting/disconnect");
                        refetchAccounting();
                      }}
                      className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Disconnect
                    </button>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                      Connected
                    </span>
                  </>
                ) : accountingStatus?.connected && accountingStatus.provider !== "xero" ? (
                  <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
                    Using {accountingStatus.provider}
                  </span>
                ) : (
                  <button
                    onClick={async () => {
                      const { url } = await api.get<{ url: string }>("/accounting/oauth/authorize", { provider: "xero" });
                      window.location.href = url;
                    }}
                    className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)]"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>

            {/* QuickBooks */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <h3 className="font-medium">QuickBooks</h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Sync overdue invoices to payment chase queue
                </p>
                {accountingStatus?.connected && accountingStatus.provider === "quickbooks" && accountingStatus.last_sync && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    Last sync: {new Date(accountingStatus.last_sync.completed_at).toLocaleString()}
                    {" "}({accountingStatus.last_sync.invoices_synced} synced)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {accountingStatus?.connected && accountingStatus.provider === "quickbooks" ? (
                  <>
                    <button
                      onClick={async () => {
                        setSyncing(true);
                        try {
                          await api.post("/accounting/sync");
                          setTimeout(() => refetchAccounting(), 3000);
                        } catch { /* handled */ }
                        finally { setSyncing(false); }
                      }}
                      disabled={syncing}
                      className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--accent)] disabled:opacity-50"
                    >
                      {syncing ? "Syncing..." : "Sync Now"}
                    </button>
                    <button
                      onClick={async () => {
                        await api.delete("/accounting/disconnect");
                        refetchAccounting();
                      }}
                      className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Disconnect
                    </button>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                      Connected
                    </span>
                  </>
                ) : accountingStatus?.connected && accountingStatus.provider !== "quickbooks" ? (
                  <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
                    Using {accountingStatus.provider}
                  </span>
                ) : (
                  <button
                    onClick={async () => {
                      const { url } = await api.get<{ url: string }>("/accounting/oauth/authorize", { provider: "quickbooks" });
                      window.location.href = url;
                    }}
                    className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)]"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <h3 className="font-medium">Google Calendar</h3>
                <p className="text-sm text-[var(--muted-foreground)]">Calendar integration for booking appointments</p>
              </div>
              <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
                Coming soon
              </span>
            </div>
          </div>
        </section>

        {/* Save button */}
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="text-sm text-green-600">Settings saved successfully</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--primary)] px-6 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
