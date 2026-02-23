"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { useToast } from "@/components/toast";

interface Template {
  id: string;
  name: string;
  template_type: string;
  body_template: string;
  is_active: boolean;
}

interface Message {
  id: string;
  to_number: string;
  body: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

const templateTypes = [
  { value: "booking_confirmation", label: "Booking Confirmation" },
  { value: "inquiry_summary", label: "Inquiry Summary" },
  { value: "payment_reminder", label: "Payment Reminder" },
  { value: "custom", label: "Custom" },
];

const statusColors: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-800",
  sent: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  read: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function WhatsAppPage() {
  const { data: templatesData, refetch: refetchTemplates } = useApi<{ data: Template[] }>("/whatsapp/templates");
  const { data: messagesData, refetch: refetchMessages } = useApi<{ data: Message[]; total: number }>("/whatsapp/messages");
  const { toast } = useToast();
  const [tab, setTab] = useState<"templates" | "messages" | "send">("templates");
  const [editForm, setEditForm] = useState({ name: "", template_type: "booking_confirmation", body_template: "" });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendForm, setSendForm] = useState({ to: "", body: "" });
  const [sending, setSending] = useState(false);

  const templates = templatesData?.data ?? [];
  const messages = messagesData?.data ?? [];

  async function handleSaveTemplate() {
    setSaving(true);
    try {
      await api.post("/whatsapp/templates", editForm);
      setEditing(false);
      setEditForm({ name: "", template_type: "booking_confirmation", body_template: "" });
      toast("Template saved", "success");
      await refetchTemplates();
    } catch {
      toast("Failed to save template.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await api.delete(`/whatsapp/templates/${id}`);
      await refetchTemplates();
    } catch {
      toast("Failed to delete template.", "error");
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      await api.post("/whatsapp/send", sendForm);
      setSendForm({ to: "", body: "" });
      toast("Message sent", "success");
      await refetchMessages();
      setTab("messages");
    } catch {
      toast("Failed to send message.", "error");
    } finally {
      setSending(false);
    }
  }

  async function handleTestSend() {
    setSending(true);
    try {
      await api.post("/whatsapp/test", sendForm);
      setSendForm({ to: "", body: "" });
      await refetchMessages();
      setTab("messages");
    } catch {
      toast("Failed to send test message.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">WhatsApp</h1>
      <p className="mb-6 text-[var(--muted-foreground)]">
        Send post-call confirmations and reminders via WhatsApp.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        {(["templates", "messages", "send"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[var(--primary)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {t === "templates" ? "Templates" : t === "messages" ? "Message History" : "Send Message"}
          </button>
        ))}
      </div>

      {/* Templates Tab */}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditForm({ name: "", template_type: "booking_confirmation", body_template: "" });
                setEditing(true);
              }}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
            >
              Add Template
            </button>
          </div>

          {editing && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                    placeholder="Booking Confirmation"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={editForm.template_type}
                    onChange={(e) => setEditForm({ ...editForm, template_type: e.target.value })}
                    className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                  >
                    {templateTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Message Template</label>
                <textarea
                  value={editForm.body_template}
                  onChange={(e) => setEditForm({ ...editForm, body_template: e.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                  placeholder="Hi {contact_name}, your appointment with {company_name} is confirmed for {datetime}."
                />
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Variables: {"{contact_name}"}, {"{company_name}"}, {"{datetime}"}, {"{builder_name}"}, {"{invoice_ref}"}, {"{amount}"}
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={saving || !editForm.name || !editForm.body_template}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Template"}
                </button>
              </div>
            </div>
          )}

          {templates.map((template) => (
            <div key={template.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{template.name}</h3>
                    <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs">
                      {templateTypes.find((t) => t.value === template.template_type)?.label ?? template.template_type}
                    </span>
                    {template.is_active && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Active</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)] font-mono">{template.body_template}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditForm({
                        name: template.name,
                        template_type: template.template_type,
                        body_template: template.body_template,
                      });
                      setEditing(true);
                    }}
                    className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--accent)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

          {templates.length === 0 && !editing && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[var(--muted-foreground)]">
              No templates configured yet. Add a template to get started.
            </div>
          )}
        </div>
      )}

      {/* Messages Tab */}
      {tab === "messages" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => refetchMessages()}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)]"
            >
              Refresh
            </button>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">To</th>
                  <th className="px-4 py-3 text-left font-medium">Message</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {messages.map((msg) => (
                  <tr key={msg.id}>
                    <td className="px-4 py-3 font-mono text-xs">{msg.to_number}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{msg.body}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[msg.status] ?? "bg-gray-100 text-gray-800"}`}>
                        {msg.status}
                      </span>
                      {msg.error_message && (
                        <p className="text-xs text-red-600 mt-0.5">{msg.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                      {new Date(msg.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {messages.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                      No messages sent yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Send Tab */}
      {tab === "send" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium mb-1">Phone Number</label>
            <input
              type="tel"
              value={sendForm.to}
              onChange={(e) => setSendForm({ ...sendForm, to: e.target.value })}
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="+61 4XX XXX XXX"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea
              value={sendForm.body}
              onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Type your message..."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleTestSend}
              disabled={sending || !sendForm.to || !sendForm.body}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)] disabled:opacity-50"
            >
              {sending ? "Sending..." : "Test Send"}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !sendForm.to || !sendForm.body}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
