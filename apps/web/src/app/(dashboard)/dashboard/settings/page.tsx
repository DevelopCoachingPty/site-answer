"use client";

export default function SettingsPage() {
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
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Smith Brothers Construction"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Builder Name</label>
              <input
                type="text"
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Dave Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <input
                type="tel"
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="+44 7700 900000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Timezone</label>
              <select className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm">
                <option value="Europe/London">Europe/London (GMT/BST)</option>
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
          {/* TODO: Business hours editor */}
          <p className="text-sm text-[var(--muted-foreground)]">Business hours editor coming soon.</p>
        </section>

        {/* Escalation */}
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Escalation Settings</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Escalation Phone</label>
              <input
                type="tel"
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Your mobile number"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="escalation_sms" defaultChecked />
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
              <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90">
                Connect
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <h3 className="font-medium">Google Calendar</h3>
                <p className="text-sm text-[var(--muted-foreground)]">Calendar integration for booking appointments</p>
              </div>
              <button className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]">
                Connect
              </button>
            </div>
          </div>
        </section>

        {/* Save button */}
        <div className="flex justify-end">
          <button className="rounded-lg bg-[var(--primary)] px-6 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
