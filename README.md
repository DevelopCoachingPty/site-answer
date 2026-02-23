# SiteAnswer

AI-powered receptionist platform for trade & service businesses. Handles inbound calls, books appointments, chases overdue payments, and integrates with CRM, accounting, and calendar systems.

## Architecture

```
apps/
  api/          Fastify 5 REST API (TypeScript, ESM)
  web/          Next.js 15 dashboard (App Router, Tailwind CSS)
packages/
  shared/       Shared types and utilities
  supabase/     Database migrations and Supabase config
  tsconfig/     Shared TypeScript configs
  eslint-config/ Shared ESLint configs
```

**Stack:** Node 20 · pnpm · Turborepo · Supabase (Postgres + Auth + RLS) · Redis + BullMQ · Twilio · ElevenLabs · GoHighLevel · Xero/QuickBooks · Google/Outlook Calendar

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm (`corepack enable && corepack prepare pnpm@10 --activate`)
- Supabase CLI (`npx supabase init` or install globally)
- Redis (local or Docker: `docker run -d -p 6379:6379 redis:7-alpine`)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start Supabase locally
cd packages/supabase && npx supabase start

# Copy the printed anon key and service role key into your .env files

# Run migrations
pnpm --filter @site-answer/supabase db:push

# Start development servers (API on :3001, Web on :3000)
pnpm dev
```

### Docker

```bash
# Copy and fill in production env vars
cp .env.production.example .env

# Build and run all services
docker compose up --build
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all test suites |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm lint` | ESLint across all packages |
| `pnpm clean` | Remove build artifacts |

## API Modules

| Module | Prefix | Auth | Description |
|--------|--------|------|-------------|
| Health | `/health` | None | Liveness + dependency checks |
| Auth | `/api/v1/auth` | JWT | Login, register, session |
| Organisations | `/api/v1/organisations` | JWT+Org | Org settings, integrations |
| Calls | `/api/v1/calls` | JWT+Org | Call log, stats, actions |
| Scripts | `/api/v1/scripts` | JWT+Org | Conversation AI templates |
| Knowledge Base | `/api/v1/knowledge-base` | JWT+Org | FAQ, services, pricing |
| Payment Chase | `/api/v1/payment-chase` | JWT+Org | Overdue invoice chasing |
| WhatsApp | `/api/v1/whatsapp` | JWT+Org | Templates, messaging |
| Analytics | `/api/v1/analytics` | JWT+Org | Historical call data, CSV export |
| Calendar | `/api/v1/calendar` | JWT+Org | Google/Outlook/GHL calendars |
| Accounting | `/api/v1/accounting` | JWT+Org | Xero/QuickBooks OAuth + sync |
| GHL | `/api/v1/ghl` | JWT+Org | GoHighLevel CRM OAuth |
| Usage | `/api/v1/usage` | JWT+Org | Call minutes, costs |
| Admin | `/api/v1/admin` | JWT+Admin | Platform administration |
| Telephony | `/api/v1/webhooks/telephony` | Twilio sig | Inbound call webhooks |
| ElevenLabs | `/api/v1/webhooks/elevenlabs` | None (agent) | AI agent tool calls |

## Background Workers

| Worker | Queue | Schedule |
|--------|-------|----------|
| Post-call processing | `POST_CALL` | On call completion |
| GHL contact sync | `GHL_SYNC` | On call action |
| Agent prompt sync | `AGENT_SYNC` | On KB/script change |
| Payment chase dialler | `PAYMENT_CHASE` | Every 5 minutes |
| Invoice sync | `INVOICE_SYNC` | On manual trigger |
| Stats aggregation | `STATS_AGGREGATION` | Daily at midnight |

## Environment Variables

See [`.env.production.example`](.env.production.example) for all variables with descriptions.

**Required for any deployment:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `FRONTEND_URL`, `ENCRYPTION_KEY`

**Generate encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Testing

155 tests across 17 test suites covering all API modules.

```bash
pnpm test                    # Run all tests
pnpm --filter @site-answer/api test:watch  # Watch mode
```

## Deployment

### API (Docker)

```bash
docker build -f apps/api/Dockerfile -t site-answer-api .
docker run -p 3001:3001 --env-file apps/api/.env site-answer-api
```

### Web (Docker)

```bash
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1 \
  -t site-answer-web .
docker run -p 3000:3000 site-answer-web
```

### Database

Migrations are in `packages/supabase/migrations/`. Push to a hosted Supabase project:

```bash
cd packages/supabase
npx supabase link --project-ref <project-id>
npx supabase db push
```
