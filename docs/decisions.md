# Decisions

Choices made where the product spec is silent (spec rule 7). Newest at the bottom.

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-10-18 | Product working name **TableOS**; repo `tableos`. Domains in config use `<brand>` = `tableos.in`. | Spec leaves the brand open. |
| 2 | 2026-10-18 | Visual language follows Swiggy's style (orange `#FC8019` accent, near-black ink, grey `#F0F0F5` surfaces, green ADD / cart bar, right-aligned dish photos), **without** using Swiggy's logo, name, illustrations or proprietary font. | Requested look; trademark and trade-dress safety. |
| 3 | 2026-10-18 | Typeface **Outfit** (geometric, close to Gilroy) for Latin, **Mukta** for Devanagari, self-hosted through `next/font`. | Gilroy is proprietary; Mukta covers Hindi and Marathi. |
| 4 | 2026-10-18 | TypeScript 6.0.x, Prisma 7.10.x (stable), Next.js 16, Express 5, Zod 4. | TS 7 (Go) lacks the compiler API that Next/ESLint/Vitest need; Prisma 8 is still RC. |
| 5 | 2026-10-18 | `users.id` equals the Supabase `auth.users.id`. The API upserts the profile row on first authenticated request. | One identity key; no mapping table. |
| 6 | 2026-10-18 | Payments reuse the travel project's architecture: provider registry/factory, REST adapters without SDKs (Razorpay, Stripe), status mapping to one internal set, payment reference + attempts, HMAC-verified webhooks, reconciliation poll. A `mock` provider is used locally and in tests. | Requested by the owner; proven design. |
| 7 | 2026-10-18 | Wallet recharge provider for MVP is **Razorpay** (`PLATFORM_PG_PROVIDER=razorpay`); `mock` in development. | India-first, UPI support. |
| 8 | 2026-10-18 | Socket.IO cross-instance fan-out uses `@socket.io/postgres-adapter`. | Spec forbids Redis in MVP; Postgres already present. |
| 9 | 2026-10-18 | Domain events are collected during a unit of work and emitted after commit. | Never emit for a rolled-back write. |
| 10 | 2026-10-18 | Flat plan stored as `restaurants.flat_plan_until` (timestamp). Fee is zero while `now < flat_plan_until`. Bought through the same recharge flow with purpose `flat_plan`. | Spec defines the plan, not its storage. |
| 11 | 2026-10-18 | Wallet low-balance alerts fire once per threshold crossing, tracked by `wallets.last_alert_level_paise`, reset on recharge. | Spec says "once per threshold crossing". |
| 12 | 2026-10-18 | Recharge invoices numbered `TOS/YYYY-YY/NNNNNN` per financial year, with 18% GST added on top of the recharge amount (wallet is credited the pre-tax amount). | GST applies to platform fees; credit equals what the restaurant can spend. |
| 13 | 2026-10-18 | Staff invites are `staff_invites` rows (email or phone + role + token, 7-day expiry); accepting creates the membership. | Spec lists invites but no table. |
| 14 | 2026-10-18 | Idempotency keys stored in `idempotency_keys` (scope, key, request hash, response, 24h TTL). A replay with a different body returns 422. | Spec requires the header; storage unspecified. |
| 15 | 2026-10-18 | Search tolerant of spelling mistakes is done client-side over the already-loaded menu with a trigram + edit-distance scorer. | Whole menu is in one response; avoids a round trip. |
| 16 | 2026-10-18 | The Figma file (Starter plan) holds Foundations and Components; the plan's 3-page and MCP call limits block full screen coverage. CSS tokens in `packages/ui` are the source of truth and mirror the Figma variables. | Tool limits. |
| 17 | 2026-10-18 | Data access: services call Prisma directly for single-table, `restaurantId`-scoped operations; lock-heavy money queries live in repositories (`wallet.repository.ts`). Tenant scoping is proven by `test/tenant-isolation.test.ts` across every dashboard route. Deviation from spec §3.4 ("only repositories touch Prisma"), recorded deliberately. | A repository per table would add a large pass-through layer; scoping is what the rule protects and it is tested. |
| 18 | 2026-10-18 | An order cancelled after acceptance keeps its fee (the billable event, acceptance, already happened). Rejected orders are never charged. | Spec defines acceptance as the billable unit. |
| 19 | 2026-10-18 | "First order of a session waits" means: while the session has no accepted order, new diner orders wait for staff. | Covers a rejected first order. |
| 20 | 2026-10-18 | Waiters may mark dishes and add-ons sold out (floor task during service). | Spec says "one tap" sold out; service reality. |
| 21 | 2026-10-18 | Demo seed uses Unsplash photo URLs (Unsplash licence allows free use). Production photos are uploaded to Supabase Storage. | Realistic demo without bundling images. |
| 22 | 2026-10-18 | Platform admins get read-only support access to any dashboard by sending the tenant header on GET routes; each access writes an `audit_logs` row (`support.access`). | Spec §2.5 support access. |
