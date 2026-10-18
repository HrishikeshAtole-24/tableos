# TableOS architecture

This document is the system design for TableOS: the high-level design (HLD) first, then the low-level design (LLD) of each module. The product spec is the source of truth for behaviour; this file explains how the code realises it.

---

## 1. High-level design

### 1.1 Context

```
                ┌────────────┐   scan QR    ┌──────────────────────────┐
   Diner phone ─┤ apps/web   ├─────────────►│                          │
                │ menu + www │◄── sockets ──┤                          │
                └────────────┘              │        apps/api          │──► Payment providers
                ┌────────────┐   REST/JWT   │  Express · Socket.IO     │      (Razorpay, Stripe)
 Owner / staff ─┤ apps/console├────────────►│  pg-boss workers         │──► Email (Resend/SMTP)
                │ dashboard  │◄── sockets ──┤                          │──► apps/ai (FastAPI) ──► Vision LLM
                │ + admin    │              └────────────┬─────────────┘
                └─────┬──────┘                           │ Prisma
                      │ OTP login                        ▼
                      ▼                     ┌──────────────────────────┐
               Supabase Auth ──JWT verify──►│ PostgreSQL (Supabase)    │
               Supabase Storage ◄── signed ─┤ one schema, restaurant_id│
                                    uploads └──────────────────────────┘
```

### 1.2 Components and responsibilities

| Component | Responsibility | Scales by |
|---|---|---|
| `apps/web` (Next.js) | Brand site (static/ISR) and diner menu (SSR + client islands). No business logic. | Vercel edge / CDN |
| `apps/console` (Next.js) | Restaurant dashboard and platform admin. Client-rendered behind login. | Vercel |
| `apps/api` (Express) | All business rules, REST `/v1`, Socket.IO, background jobs. Stateless per request. | Horizontal replicas; sockets use sticky sessions + the Postgres adapter |
| `apps/ai` (FastAPI) | Menu extraction (vision LLM, JSON schema output) and translation. Pure function service. | Replicas; called only by API jobs |
| PostgreSQL | System of record, job queue (pg-boss), socket fan-out (`LISTEN/NOTIFY`) | Vertical, read replicas later |
| Supabase Auth | OTP login, JWT issuance for dashboard users | Managed |
| Supabase Storage | Logos, dish photos, import files, QR PDFs | Managed / CDN |

### 1.3 Key quality attributes and how they are met

- **Correct money.** Integer paise everywhere, server-side pricing, fee charged in the same transaction that accepts an order, append-only ledger, row locks (`SELECT … FOR UPDATE`) on `usage_months` and `wallets`.
- **Tenant isolation.** Layer 1: every repository function takes `restaurantId`; membership checked in middleware. Layer 2: Postgres RLS keyed on `app.restaurant_id` (Phase 3).
- **Idempotency.** `Idempotency-Key` on order creation, recharge and payment creation, stored in `idempotency_keys` with the response.
- **Realtime with graceful fallback.** Socket.IO rooms per restaurant/session; the client falls back to 10-second polling and shows a "reconnecting" state.
- **No Redis in MVP.** Jobs in pg-boss; cross-instance socket fan-out through the Socket.IO Postgres adapter.
- **Performance budgets.** Diner menu is server-rendered with one API call, cached and revalidated by tag. JS ≤ 130 KB gz, CSS ≤ 25 KB gz.
- **Security.** Helmet + strict CSP, CORS allow-list, per-IP and per-user rate limits, HMAC-signed QR tokens, encrypted provider credentials (AES-256-GCM).

### 1.4 Request flow: one order

1. Diner posts cart with the table-session token and an `Idempotency-Key`.
2. API checks `canOrder`, rate limit (10 per session per 10 min), re-prices every line from the DB, validates availability.
3. API writes `orders` + `order_items` (snapshots) in one transaction.
4. If the session's first order needs acceptance, status stays `placed`; otherwise the order is accepted in the same transaction and the fee is metered.
5. API emits `order.created` to `restaurant:{id}:kitchen` and `restaurant:{id}:floor`, and `order.updated` to `session:{id}`.

### 1.5 Deployment

- `apps/web`, `apps/console` → Vercel.
- `apps/api`, `apps/ai` → always-on container host (Dockerfiles in each app).
- One Supabase project per environment (local via Supabase CLI, staging, production).

---

## 2. Low-level design

### 2.1 API layering

```
route (express.Router, zod parse) → controller (HTTP ⇄ DTO) → service (business rules, transactions) → repository (Prisma, always restaurantId-scoped)
```

- Only repositories import Prisma. Services receive a `Tx` (Prisma transaction client) when they must compose writes.
- Errors are thrown as `AppError(code, httpStatus, message, details?)` and serialised by one error middleware to `{ code, message, details? }`.
- Every request gets a `requestId` (header `x-request-id` or generated) attached to the pino child logger.

### 2.2 Module map (`apps/api/src/modules`)

| Module | Owns tables | Public surface |
|---|---|---|
| `auth` | users, memberships | `requireUser`, `requireRole`, `requireRestaurant`, `requirePlatformAdmin` |
| `restaurants` | restaurants | onboarding, settings, checklist |
| `menu` | menu_categories, menu_items, item_variants, addon_groups, addons, translations | editor CRUD, public menu, availability |
| `imports` | menu_imports | AI import pipeline |
| `tables` | tables | CRUD, QR token, rotate, PDF |
| `sessions` | table_sessions | diner session exchange, auto-close |
| `orders` | orders, order_items | state machine, pricing |
| `service-requests` | service_requests | cooldown, ack |
| `billing` | bills | bill computation, discount, close |
| `wallet` | wallets, wallet_ledger, usage_months, pricing_config | metering, `canOrder`, grace, recharge credit |
| `payments` | merchant_accounts, payments, payment_attempts, webhook_events | orchestration, adapters, webhooks, reconciliation |
| `admin` | audit_logs | admin endpoints |
| `analytics` | events | ingest + nightly aggregation |
| `realtime` | — | Socket.IO server, room auth, `emit*` helpers |
| `jobs` | pg-boss schema | job registration and schedules |

### 2.3 Order state machine

```
placed ──accept──► accepted ──► preparing ──► ready ──► served
   │                  │              │
   └──reject(reason)  └──cancel──────┘ (staff only)
```

Implemented as a transition table `ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]>` plus role guards. `accept` is the only transition that meters a fee. Kitchen can move `accepted → preparing → ready`; waiter can `ready → served`; owner/manager can do all.

### 2.4 Wallet metering (exact)

Inside the transaction that sets `accepted`:

```
usage  = SELECT … FROM usage_months WHERE restaurant_id=$1 AND month_key=$2 FOR UPDATE (upsert first)
wallet = SELECT … FROM wallets WHERE restaurant_id=$1 FOR UPDATE
fee    = flatPlanActive ? 0 : max(0, min(cfg.feePerOrderPaise, cfg.monthlyCapPaise - usage.feesChargedPaise))
usage.acceptedOrders += 1; usage.feesChargedPaise += fee
wallet.balancePaise  -= fee; if fee>0 insert ledger(order_fee, -fee, balance_after)
if wallet.balance <= 0 and zero_reached_at is null: zero_reached_at = now
```

`month_key` is `YYYY-MM` in Asia/Kolkata. The grace job (every 15 min) pauses ordering only outside opening hours when `balance < grace_floor` or `zero_reached_at` older than `grace_hours`.

### 2.5 Payment orchestration (pattern carried over from the travel project)

```
PaymentService
  ├── PaymentRouter        chooses merchant account by purpose/restaurant/method/priority/health
  ├── AcquirerRegistry     name → PaymentProvider (factory + registry)
  │     ├── RazorpayProvider   REST, no SDK; HMAC webhook verification
  │     ├── StripeProvider     REST, no SDK; Stripe-Signature verification
  │     └── MockProvider       local/dev and tests
  ├── StatusMapper         provider status → internal status (created/pending/succeeded/failed/expired/refunded)
  └── WebhookService       verify raw body → store webhook_events (unique event_id) → apply once
```

- A payment has a human `reference` (`PAY-YYYYMMDD-XXXXXX`) and one or more `payment_attempts` (one per provider try). Creating a new attempt cancels older pending attempts.
- Checkout is provider-hosted or UPI intent; card data never touches our servers.
- Wallet credit is applied only from a verified webhook or a verified status poll, never from the browser redirect. Credit is idempotent on `payment_id`.
- Reconciliation job polls payments pending > 5 minutes.

### 2.6 Realtime

Rooms: `restaurant:{id}:kitchen`, `restaurant:{id}:floor`, `session:{id}`. The handshake carries a dashboard JWT or a table-session token; the server decides room membership. Domain services call `realtime.emit…` **after commit** (outbox-lite: events are collected on the unit of work and flushed post-commit).

### 2.7 Data model

See `packages/db/prisma/schema.prisma`. Conventions: UUID PKs, `created_at`/`updated_at` on all tables, `restaurant_id` + index on every tenant table, snake_case columns mapped to camelCase fields, money as `Int` paise, tax as basis points.

### 2.8 Frontend architecture

- `packages/ui`: design tokens (`tokens.css`), base styles, and unstyled-logic React primitives styled with CSS Modules (Button, Sheet, Dialog, Toast, Tabs, Input, OtpInput, Badge, DietMark, Stepper, Skeleton, EmptyState, Icon set).
- `apps/web` diner menu: server component fetches the full menu once (tag-cached), client islands for cart, sheet, search, live availability and order tracking. Cart state in a small reducer persisted to `sessionStorage` per table session.
- `apps/console`: client-side data with a typed API client generated from `packages/schemas`, socket hooks for live boards.
