# SiteAnswer Project Status Update 2 — 4 March 2026

## Deployed Today (2 deployments)

### Deployment 1: Sprint 5/7/8 Completion
- Notifications API + dashboard page + unread badge in nav
- Post-call SMS sending via GHL when CRM connected
- 9 construction KB templates seeded on new org registration
- Business hours awareness in AI system prompt + after-hours script
- Sentry error tracking (lazy init, optional SENTRY_DSN)
- GDPR consent config per org (toggle + custom announcement text)
- Playwright E2E test scaffolding
- Retry/backoff for ElevenLabs (5xx) and GHL (429/503)
- GHL connect/disconnect buttons in settings
- Notification badge in nav bar
- New signup -> onboarding redirect
- Supabase migrations: warm_transfer, screening, gdpr_consent

### Deployment 2: Feature Completion
- **Post-call SMS to builder** — After every call, in-app notification created + SMS sent to builder's phone via GHL
- **Payment chase outbound calls** — Replaced 501 stub with real ElevenLabs outbound call (chase prompt, call record, status tracking)
- **Dashboard date range** — "This Week" / "This Month" toggle on stats
- **Error handling** — useApi hook retries once on failure; dashboard shows error states with retry buttons
- **Turbo.json env vars** — All 20 env vars declared; fixes Vercel build cache warnings

---

## Current State

### Live URLs
- **Web**: https://siteanswer-web-three.vercel.app
- **API**: https://siteanswer-api.vercel.app

### What's Working
- Registration + login + email confirmation
- Onboarding wizard (company details, KB, scripts, test call)
- AI agent provisioning via ElevenLabs
- Inbound call handling with dynamic system prompt
- Business hours awareness + after-hours script
- Call screening / gatekeeper (VIP, blocked, sales detection)
- Post-call processing (transcript, summary, GHL sync, WhatsApp, SMS to builder)
- Outbound payment chase calls via ElevenLabs
- Full call dashboard with filtering, transcripts, recordings
- Analytics with charts and CSV export
- Knowledge base CRUD with templates
- Scripts management
- GHL OAuth + contact sync + SMS
- Notifications (API + UI + badge)
- Settings (org, business hours, escalation, GDPR, integrations)
- Admin panel (org management, usage, alerts)
- 174 tests passing
- Both apps deploying cleanly to Vercel

---

## Still To Do

### Setup Tasks (need your input)
1. **ElevenLabs phone number** — Purchase + link to agent via onboarding
2. **Vercel + GitHub auto-deploy** — Install Vercel GitHub app on DevelopCoachingPty org, grant access to site-answer repo
3. **Custom domain** — Get a domain (e.g., siteanswer.com.au), configure DNS
4. **Sentry DSN** — Create free Sentry project, add DSN to Vercel env vars
5. **Test end-to-end** — Register account, complete onboarding, make a test call

### Code Tasks (lower priority)
6. Expand Playwright E2E tests with auth fixtures
7. Add PostHog analytics (optional)
8. WhatsApp Business API provider integration (Phase 2)
9. Outbound payment chase scheduling/automation (Phase 2)
10. Accounting sync automation for Xero/QuickBooks (Phase 2)
