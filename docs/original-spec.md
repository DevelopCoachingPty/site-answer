# SiteAnswer - Implementation Plan

## Context

SiteAnswer is an AI-powered voice call handler for construction businesses, provided as a value-add for Develop Coaching members. It uses ElevenLabs Conversational AI to answer calls, integrates with GoHighLevel CRM, and is recovered through GHL phone rebilling. The project directory is empty - building from scratch.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repo structure | **Monorepo** (Turborepo + pnpm workspaces) | Shared types between frontend/backend, single CI pipeline, independent deploys |
| Backend framework | **Fastify** (not Express) | Native TypeScript, schema validation, faster, WebSocket support for audio streaming |
| Language | **TypeScript everywhere** (strict mode) | Type safety across full stack, Zod schemas as single source of truth |
| Frontend | **Next.js 15** (App Router) + Tailwind + shadcn/ui | SSR for dashboard, good DX, Vercel deployment |
| Database | **Supabase** (PostgreSQL + Auth + Storage + RLS) | Auth, real-time, row-level security for multi-tenancy |
| Job queue | **BullMQ + Redis** | Async post-call processing, GHL rate limiting, agent sync |
| Telephony path | **SIP trunking** (primary) with WebSocket bridge fallback | SIP is simpler; fallback if GHL LC Phone constraints require it |
| ElevenLabs model | **One agent per organisation** | Clean tenant isolation, per-business voice/prompt config |

---

## Project Structure

```
site-answer/
├── apps/
│   ├── web/                    # Next.js frontend (member + admin dashboards)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/     # Login, register
│   │       │   ├── (dashboard)/ # Member: calls, knowledge base, scripts, settings, analytics
│   │       │   └── (admin)/    # Admin: organisations, usage, alerts
│   │       ├── components/     # UI components (shadcn/ui based)
│   │       ├── lib/            # Supabase clients, API client, utils
│   │       └── hooks/          # React hooks for data fetching
│   │
│   └── api/                    # Fastify backend
│       └── src/
│           ├── server.ts       # App entry, plugin registration
│           ├── config/         # Env validation (Zod), constants
│           ├── plugins/        # Auth, Supabase, error handler, rate limit, CORS
│           ├── modules/        # Domain modules (see below)
│           │   ├── telephony/  # Call webhooks, audio bridge
│           │   ├── elevenlabs/ # Agent CRUD, tool function endpoints
│           │   ├── ghl/        # CRM client, OAuth, contact ops
│           │   ├── calls/      # Call list/detail API
│           │   ├── knowledge-base/
│           │   ├── organisations/
│           │   ├── scripts/    # Conversation script CRUD
│           │   ├── admin/      # Admin-only endpoints
│           │   └── usage/      # Usage tracking API
│           ├── lib/            # Supabase admin client, queue, logger, crypto, errors
│           └── workers/        # BullMQ workers (post-call, ghl-sync, agent-sync)
│
├── packages/
│   ├── shared/                 # Shared Zod schemas, TS types, constants
│   ├── supabase/               # Migrations, seed data, config
│   ├── eslint-config/          # Shared ESLint configs
│   └── tsconfig/               # Shared TS configs (base, next, node)
│
├── turbo.json
├── pnpm-workspace.yaml
└── .github/workflows/          # CI (lint, test, typecheck)
```

Each backend module follows: `routes.ts` → `handlers.ts` → `service.ts` → `schemas.ts` + `__tests__/`

---

## Phase 1 - MVP (8 Sprints, ~12 weeks)

### Sprint 0: Project Scaffolding (Week 1)

**Goal: Everything builds and deploys, nothing works yet.**

- [ ] Initialize Turborepo monorepo with pnpm workspaces
- [ ] Create shared TypeScript and ESLint configs
- [ ] Create `packages/shared` (empty, with Zod + types structure)
- [ ] Scaffold `apps/web` (Next.js 15, App Router, Tailwind, shadcn/ui)
- [ ] Scaffold `apps/api` (Fastify 5, TypeBox, pino logger)
- [ ] Configure `turbo.json` pipelines (build, dev, lint, test, typecheck)
- [ ] Set up Supabase project, install CLI, create `packages/supabase`
- [ ] GitHub Actions CI (lint + typecheck + test on PR)
- [ ] Env config with Zod validation (`apps/api/src/config/env.ts`)
- [ ] Deployment dry-run: Vercel (web) + Railway (api)
- [ ] `.gitignore`, `.env.example` files

**Done when:** `pnpm dev` starts both apps, `pnpm build` passes, CI green, both deploy with placeholder pages.

---

### Sprint 1: Database + Auth + Core Types (Weeks 2-3)

**Goal: Schema deployed, auth works end-to-end, shared types defined.**

- [ ] Write SQL migrations (schema, RLS policies, triggers, seed data)
- [ ] Tables: `organisations`, `users`, `knowledge_base`, `calls`, `call_actions`, `conversation_scripts`, `usage_tracking`, `webhook_events`
- [ ] Run migrations with Supabase CLI
- [ ] Generate TypeScript types from Supabase (`supabase gen types`)
- [ ] Define Zod schemas in `packages/shared` (one file per domain entity)
- [ ] Supabase Auth setup (email/password)
- [ ] Frontend auth pages (login, register) using `@supabase/ssr`
- [ ] Auth middleware (frontend) - redirect unauthenticated to login
- [ ] Auth plugin (backend) - verify Supabase JWT, extract user/org context
- [ ] Supabase client plugin (backend) - service_role + user clients
- [ ] Centralised error handling plugin
- [ ] User registration flow (create auth user + users row + organisations row)

**Done when:** User can register, log in, see blank dashboard. API rejects unauthenticated requests. RLS prevents cross-org access.

---

### Sprint 2: Organisation Settings + Knowledge Base (Weeks 3-4)

**Goal: Members manage their business settings and knowledge base. Admin sees all orgs.**

- [ ] Organisation CRUD API (GET/PATCH own org, admin GET all)
- [ ] Settings page (business name, hours, timezone, phone, escalation settings)
- [ ] Knowledge base CRUD API (categorised entries: services, pricing, FAQ, process, team, area)
- [ ] Knowledge base UI (list, add, edit, delete by category)
- [ ] Admin organisations list API + page (table with status, usage summary)
- [ ] Role-based routing (admin layout checks `is_admin`)
- [ ] Typed API client library for frontend (`apps/web/src/lib/api-client.ts`)

**Done when:** Member configures their org, manages knowledge base. Admin views all orgs.

---

### Sprint 3: GHL Integration Layer (Weeks 4-6)

**Goal: Backend authenticates with GHL, manages contacts, logs activities.**

- [ ] GHL OAuth2 flow (member clicks "Connect GHL" → redirect → callback → store encrypted tokens)
- [ ] Token refresh middleware (auto-refresh expired tokens)
- [ ] AES-256-GCM encryption for OAuth tokens (`apps/api/src/lib/crypto.ts`)
- [ ] Contact lookup by phone number
- [ ] Contact creation (with tags: `siteanswer-lead`, custom fields)
- [ ] Activity/note logging to contact timeline
- [ ] SMS sending via GHL
- [ ] Pipeline opportunity creation
- [ ] Rate limiter (100 req/10s per resource, 200K/day)
- [ ] GHL connection status in settings UI
- [ ] Integration tests against GHL sandbox

**Done when:** Backend can auth with GHL per-org, look up/create contacts, log activities, send SMS, with rate limiting.

---

### Sprint 4: ElevenLabs Agent Management (Weeks 5-7)

**Goal: Each org gets a configured AI agent. Knowledge base changes sync to agent.**

- [ ] ElevenLabs API client wrapper (`elevenlabs.client.ts`)
- [ ] Agent provisioning (`provisionAgent(orgId)` - creates agent, stores `agent_id`)
- [ ] Dynamic system prompt builder (assembles from org data + knowledge base + scripts)
- [ ] BullMQ queue + worker for agent-sync (knowledge base update → rebuild agent prompt)
- [ ] Register ElevenLabs tool functions: `lookup_caller`, `create_new_contact`, `check_calendar`, `book_appointment`, `send_sms`, `escalate_to_builder`, `get_knowledge`, `log_message`
- [ ] Tool function endpoints (ElevenLabs calls these during conversation → backend queries GHL/DB → returns data)
- [ ] Conversation script CRUD API + editor UI
- [ ] Agent config UI in settings (status, voice selection)
- [ ] Redis setup (Railway addon or Upstash) for BullMQ

**Done when:** Each org has its own ElevenLabs agent. KB updates trigger re-sync. Tool functions work end-to-end.

---

### Sprint 5: Telephony Integration (Weeks 6-8) - THE BIG ONE

**Goal: Calls are answered by AI, conversations happen in real-time, data is logged.**

- [ ] Phone number assignment to organisations
- [ ] Incoming call webhook (`POST /webhooks/telephony/incoming`) - identify org, determine call flow
- [ ] Webhook idempotency (check `webhook_events` table before processing)
- [ ] Webhook signature verification (Twilio `X-Twilio-Signature`)
- [ ] Call status webhook (ringing → in-progress → completed/failed)
- [ ] Business hours check (per org timezone + configured hours)
- [ ] Call flow routing (new inquiry vs existing client vs after-hours vs supplier)
- [ ] Audio bridge (WebSocket: Twilio Media Streams ↔ format conversion ↔ ElevenLabs WebSocket) - if SIP trunking isn't viable
- [ ] Post-call webhook from ElevenLabs (transcript, summary, tool call history)
- [ ] Post-call worker (save transcript, update call record, queue GHL sync, update usage)
- [ ] GHL sync worker (create/update contact, log activity, create opportunity - with retry + rate limiting)
- [ ] After-hours handling (voicemail script or message-taking)
- [ ] Emergency keyword detection → immediate escalation (SMS + call to builder)

**Done when:** Incoming call → AI answers → converses → looks up/creates contacts → logs everything → syncs to GHL.

---

### Sprint 6: Call Dashboard + Analytics (Weeks 8-10)

**Goal: Members see call history, transcripts, recordings, and basic analytics.**

- [ ] Calls list API (paginated, filterable by date/status/type)
- [ ] Call detail API (full transcript, actions, recording URL)
- [ ] Calls list page (table: time, caller, type, duration, sentiment, summary)
- [ ] Call detail page (chat-style transcript, recording player, actions taken, GHL link)
- [ ] Usage API (current + historical)
- [ ] Analytics page (call volume charts, avg duration, flow breakdown, leads captured)
- [ ] Admin usage dashboard (cross-org usage, cost tracking, margin)
- [ ] Recording playback (pre-signed URLs from Supabase Storage)
- [ ] Real-time call indicator (in-progress call status in dashboard header)

**Done when:** Member dashboard shows full call history with filtering, transcripts, recordings, and charts. Admin sees cross-org usage.

---

### Sprint 7: Onboarding + Member Experience (Weeks 10-11)

**Goal: Smooth onboarding flow, test call feature, notifications.**

- [ ] Onboarding wizard (guided steps: business info → connect GHL → knowledge base → phone setup → voice selection → test call)
- [ ] Pre-built construction knowledge base templates
- [ ] Test call feature (trigger a call to builder's phone so they experience SiteAnswer)
- [ ] In-app notifications table + UI (usage alerts, failed calls, GHL disconnected)
- [ ] SMS summary to builder after each call
- [ ] Escalation flow (urgent SMS + call to builder's mobile)
- [ ] Mobile-responsive priority views (recent calls, escalation notifications, "callback done" marking)

**Done when:** New member can self-onboard, test SiteAnswer, and receive notifications.

---

### Sprint 8: Polish + Testing + Launch (Weeks 11-12)

**Goal: Production-ready MVP.**

- [ ] Sentry integration (backend + frontend error tracking)
- [ ] PostHog integration (usage analytics, feature flags)
- [ ] Rate limiting on all API endpoints
- [ ] CORS configuration
- [ ] Health check endpoint (`GET /health` - DB, Redis, ElevenLabs status)
- [ ] Graceful degradation (ElevenLabs down → voicemail, GHL down → queue and retry)
- [ ] Retry logic audit (all external calls use exponential backoff with jitter)
- [ ] End-to-end tests (Playwright: login, calls, knowledge base)
- [ ] API integration tests (Fastify inject())
- [ ] WebSocket/audio bridge load test (concurrent calls)
- [ ] Security audit (RLS policies, webhook signatures, token encryption)
- [ ] Staging environment + production deployment checklist
- [ ] GDPR consent announcement config per org

**Done when:** All tests pass, monitoring active, staging verified, ready for first member.

---

## Additions Beyond the Spec

These are things the spec doesn't explicitly cover but are essential:

1. **Webhook idempotency** - `webhook_events` table prevents duplicate processing on retries
2. **Async job queue** (BullMQ + Redis) - post-call processing, GHL sync, agent sync don't block webhooks
3. **Structured logging + correlation IDs** - trace a call from Twilio webhook → ElevenLabs tool call → GHL sync
4. **Notifications table** - in-app alerts for usage limits, failed calls, GHL disconnection
5. **API versioning** - `/api/v1/` from day one
6. **Graceful degradation** - ElevenLabs down → voicemail, GHL down → queue for later
7. **GHL token encryption** - AES-256-GCM at rest, key from env
8. **Concurrent call handling** - each call gets its own WebSocket pair, `Map<callSid, BridgeSession>`
9. **Agent versioning** - conversation scripts have version numbers, rollback capability
10. **Feature flags** (PostHog) - gradual rollout of features per org

---

## Phase 2 Preview (6-8 weeks after Phase 1)

- Outbound payment chasing (scheduled calls from `payment_chase_queue`)
- Xero / QuickBooks integration (same OAuth + service pattern as GHL)
- Outlook / Microsoft 365 calendar
- Supplier/subcontractor call handling
- WhatsApp confirmations
- Advanced analytics dashboard
- Conversation script editor with preview

## Phase 3 Preview (Ongoing)

- AI learning from successful calls
- Voice cloning (ElevenLabs Professional Voice Cloning API)
- Mobile app (React Native, same REST API)
- GHL Marketplace app
- Multi-language support
- CostTracker Pro / Architect Attractor integration

---

## Verification Plan

After each sprint, verify:

1. **Sprint 0:** `pnpm dev` starts both apps, `pnpm build` succeeds, CI passes, both deploy
2. **Sprint 1:** Register → login → see dashboard. Two test users can't see each other's data
3. **Sprint 2:** Edit org settings, CRUD knowledge base entries, admin sees all orgs
4. **Sprint 3:** Connect GHL OAuth, look up a test contact, create a contact, send SMS
5. **Sprint 4:** Provision ElevenLabs agent, update KB → agent prompt updates, tool functions return data
6. **Sprint 5:** Make a real phone call → AI answers → conversation → data in DB + GHL
7. **Sprint 6:** Dashboard shows call history, play recording, view transcript, see analytics
8. **Sprint 7:** Run through full onboarding wizard, trigger test call
9. **Sprint 8:** Sentry captures test error, load test passes, staging deploy works
