# TableOS

QR menu and table ordering for independent restaurants and cafés in India. A diner scans the QR on the table, browses the menu, orders and tracks the order from the phone browser — no app, no login. The restaurant runs its menu, orders, kitchen and billing from one dashboard.

**Pricing model:** the menu is free; ordering costs ₹2 per accepted order from a prepaid wallet, capped at ₹999 a month (or a flat ₹999 a month). Diner money never passes through the platform.

## What is in this repository

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16 — brand website (`/`, `/features`, `/pricing`, `/demo`, …) and the diner menu (`/r/<slug>?t=<qr-token>`) |
| `apps/console` | Next.js 16 — restaurant dashboard (orders, kitchen, waiter, menu, AI import, tables & QR, wallet, staff, insights, settings) and platform admin (`/admin`) |
| `apps/api` | Express 5 API (REST `/v1`), Socket.IO realtime, pg-boss background jobs |
| `apps/ai` | FastAPI service — menu extraction from photos/PDFs and translation with Claude |
| `packages/db` | Prisma schema, migrations (incl. row-level security), seed |
| `packages/schemas` | Zod contracts and shared money/constants (`@tableos/schemas/client` is the Zod-free browser entry) |
| `packages/ui` | Design system: tokens, global CSS, icons and React primitives — fully custom CSS, no framework |
| `e2e` | Playwright end-to-end tests |
| `docs` | [Architecture (HLD/LLD)](docs/architecture.md), [API reference](docs/api.md), [decisions](docs/decisions.md) |

Design: Swiggy-inspired visual language (orange `#FC8019`, near-black ink, grey surfaces, green commerce actions), Outfit + Mukta typefaces. Figma file: *TableOS — Product Design* (foundations and components).

## Run it locally

Requirements: Node 24, pnpm 11, Docker Desktop, Python 3.12.

```bash
pnpm install
npx supabase start -x edge-runtime,logflare,vector,realtime,studio,postgres-meta,supavisor
cp .env.example .env            # fill values from `npx supabase status -o env`, generate the secrets
for a in web console; do grep -E '^(NEXT_PUBLIC_|REVALIDATE_SECRET)' .env > apps/$a/.env.local; done
pnpm db:deploy && pnpm db:seed  # migrations + demo restaurant "Spice Route Café"

# AI service (needs LLM_API_KEY for real extraction)
cd apps/ai && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && cd ../..

pnpm dev                        # api :4000, web :3000, console :3001, ai :8000
```

- Dashboard: http://localhost:3001 — sign in with `owner@demo.tableos.in` (also `manager@`, `waiter@`, `kitchen@demo.tableos.in`; platform admin `admin@tableos.in`). The 6-digit code arrives in the local inbox at http://127.0.0.1:54324.
- Diner menu for a table: `pnpm --filter @tableos/api exec tsx --env-file=../../.env scripts/qr-link.ts T3` prints a signed table link, or use **Tables & QR → open link** in the dashboard.
- Payments use the `mock` provider locally (a test checkout page that sends a signed webhook). Set `PLATFORM_PG_PROVIDER=razorpay` plus key, secret and webhook secret for Razorpay test mode.

## Tests

```bash
pnpm --filter @tableos/api test      # 46 tests: unit, order flow, wallet & payments, tenant isolation (real Postgres)
pnpm --filter @tableos/schemas test  # money maths
pnpm --filter @tableos/ai test       # AI service
npx playwright test                  # e2e on the running stack: diner at 360px, accept → kitchen → ready, wallet recharge
npx eslint . && npx stylelint "**/*.css" && pnpm -r typecheck
```

CI (`.github/workflows/ci.yml`) runs the audit, lint, typecheck, tests and builds on every pull request.

## Deploy

- `apps/web`, `apps/console` → Vercel (set the `NEXT_PUBLIC_*` variables and `REVALIDATE_SECRET`).
- `apps/api` → container host: `docker build -f apps/api/Dockerfile -t tableos-api .` (run `prisma migrate deploy` from `packages/db` on release).
- `apps/ai` → container host: `docker build -t tableos-ai apps/ai`.
- One Supabase project per environment. In production the API should connect as the `tableos_api` role so row-level security applies (see the RLS migration).

## Branching

`main` is releasable; `develop` is the integration branch. Work happens on feature branches merged into `develop` through pull requests.
