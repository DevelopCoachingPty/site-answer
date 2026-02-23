"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { useToast } from "@/components/toast";

interface Organisation {
  id: string;
  name: string;
  builder_name: string | null;
  phone_number: string | null;
  timezone: string | null;
  ghl_connected: boolean;
  elevenlabs_agent_id: string | null;
}

interface AuthData {
  user: { id: string; email: string; full_name: string; organisation_id: string | null };
  organisation: Organisation | null;
}

const steps = [
  { id: "company", title: "Company Details", description: "Tell us about your business" },
  { id: "knowledge", title: "Knowledge Base", description: "Add info so the AI can answer questions" },
  { id: "scripts", title: "Review Scripts", description: "Check how the AI handles calls" },
  { id: "test", title: "Test Call", description: "Try calling your AI receptionist" },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: authData } = useApi<{ data: AuthData }>("/auth/me");
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Company form
  const [companyForm, setCompanyForm] = useState({
    name: "",
    builder_name: "",
    phone_number: "",
    timezone: "Australia/Sydney",
    escalation_phone: "",
  });

  // KB quick-add
  const [kbEntries, setKbEntries] = useState<Array<{ category: string; title: string; content: string }>>([
    { category: "services", title: "", content: "" },
  ]);

  useEffect(() => {
    if (authData?.data?.organisation) {
      const org = authData.data.organisation;
      setCompanyForm({
        name: org.name ?? "",
        builder_name: org.builder_name ?? "",
        phone_number: org.phone_number ?? "",
        timezone: org.timezone ?? "Australia/Sydney",
        escalation_phone: "",
      });
    }
  }, [authData]);

  async function saveCompanyDetails() {
    setSaving(true);
    try {
      await api.patch("/organisations", companyForm);
      setCurrentStep(1);
    } catch {
      toast("Failed to save. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveKnowledgeBase() {
    setSaving(true);
    try {
      for (const entry of kbEntries) {
        if (entry.title.trim() && entry.content.trim()) {
          await api.post("/knowledge-base", entry);
        }
      }
      setCurrentStep(2);
    } catch {
      toast("Failed to save knowledge base entries.", "error");
    } finally {
      setSaving(false);
    }
  }

  function finishOnboarding() {
    router.push("/dashboard");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Welcome to SiteAnswer</h1>
      <p className="text-[var(--muted-foreground)] mb-8">
        Let&apos;s get your AI receptionist set up. This takes about 5 minutes.
      </p>

      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {steps.map((step, i) => (
          <div key={step.id} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition-colors ${
                i <= currentStep ? "bg-[var(--primary)]" : "bg-[var(--border)]"
              }`}
            />
            <p className={`mt-2 text-xs ${i <= currentStep ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>
              {step.title}
            </p>
          </div>
        ))}
      </div>

      {/* Step 0: Company Details */}
      {currentStep === 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-1">{steps[0]!.title}</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">{steps[0]!.description}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Company Name</label>
              <input
                type="text"
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Smith Brothers Construction"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Your Name</label>
              <input
                type="text"
                value={companyForm.builder_name}
                onChange={(e) => setCompanyForm({ ...companyForm, builder_name: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Dave Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Business Phone</label>
              <input
                type="tel"
                value={companyForm.phone_number}
                onChange={(e) => setCompanyForm({ ...companyForm, phone_number: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="+61 4XX XXX XXX"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Timezone</label>
              <select
                value={companyForm.timezone}
                onChange={(e) => setCompanyForm({ ...companyForm, timezone: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="Australia/Sydney">Sydney (AEST/AEDT)</option>
                <option value="Australia/Melbourne">Melbourne (AEST/AEDT)</option>
                <option value="Australia/Brisbane">Brisbane (AEST)</option>
                <option value="Australia/Perth">Perth (AWST)</option>
                <option value="Pacific/Auckland">Auckland (NZST/NZDT)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Escalation Phone (your mobile)</label>
              <input
                type="tel"
                value={companyForm.escalation_phone}
                onChange={(e) => setCompanyForm({ ...companyForm, escalation_phone: e.target.value })}
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="The AI will call/text you here for urgent matters"
              />
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <button
              onClick={saveCompanyDetails}
              disabled={saving || !companyForm.name}
              className="rounded-lg bg-[var(--primary)] px-6 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Knowledge Base */}
      {currentStep === 1 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-1">{steps[1]!.title}</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Add some key information about your business. The AI uses this to answer caller questions.
            You can always add more later.
          </p>

          <div className="space-y-4">
            {kbEntries.map((entry, i) => (
              <div key={i} className="space-y-2 p-4 rounded-lg border border-[var(--border)]">
                <div className="flex gap-2">
                  <select
                    value={entry.category}
                    onChange={(e) => {
                      const next = [...kbEntries];
                      next[i] = { ...entry, category: e.target.value };
                      setKbEntries(next);
                    }}
                    className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                  >
                    <option value="services">Services</option>
                    <option value="pricing">Pricing</option>
                    <option value="faq">FAQ</option>
                    <option value="process">Process</option>
                    <option value="area_coverage">Area Coverage</option>
                  </select>
                  <input
                    type="text"
                    value={entry.title}
                    onChange={(e) => {
                      const next = [...kbEntries];
                      next[i] = { ...entry, title: e.target.value };
                      setKbEntries(next);
                    }}
                    placeholder="e.g. Bathroom Renovations"
                    className="flex-1 rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  value={entry.content}
                  onChange={(e) => {
                    const next = [...kbEntries];
                    next[i] = { ...entry, content: e.target.value };
                    setKbEntries(next);
                  }}
                  placeholder="Describe this to the AI..."
                  rows={3}
                  className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>

          <button
            onClick={() => setKbEntries([...kbEntries, { category: "services", title: "", content: "" }])}
            className="mt-3 text-sm text-[var(--primary)] hover:underline"
          >
            + Add another entry
          </button>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setCurrentStep(0)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
            >
              Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentStep(2)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
              >
                Skip for now
              </button>
              <button
                onClick={saveKnowledgeBase}
                disabled={saving}
                className="rounded-lg bg-[var(--primary)] px-6 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Review Scripts */}
      {currentStep === 2 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-1">{steps[2]!.title}</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            SiteAnswer comes with pre-built conversation scripts for common call types.
            You can customise these anytime from the Scripts page.
          </p>

          <div className="space-y-3">
            {[
              { name: "New Inquiry", desc: "Greets potential clients, gathers details, offers to book a callback" },
              { name: "Existing Client", desc: "Recognises returning callers, checks project status, handles requests" },
              { name: "Payment / Accounts", desc: "Handles invoice queries, payment options, and disputes professionally" },
              { name: "After Hours", desc: "Takes messages, checks for emergencies, sends SMS summary to you" },
              { name: "Supplier / Sub", desc: "Quick and efficient handling of supplier and subcontractor calls" },
            ].map((script) => (
              <div key={script.name} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4">
                <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{script.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{script.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setCurrentStep(1)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              className="rounded-lg bg-[var(--primary)] px-6 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Test Call */}
      {currentStep === 3 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-1">{steps[3]!.title}</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Ready to hear SiteAnswer in action? We&apos;ll call your phone so you can experience
            what your callers will hear.
          </p>

          <div className="rounded-lg bg-[var(--muted)] p-6 text-center">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              Test calls will be available once your phone number is configured.
              For now, you&apos;re all set up!
            </p>
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setCurrentStep(2)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]"
            >
              Back
            </button>
            <button
              onClick={finishOnboarding}
              className="rounded-lg bg-[var(--primary)] px-6 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
