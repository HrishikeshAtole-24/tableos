# TableOS API reference

Base URL: `https://api.<brand>` (local `http://localhost:4000`). All routes are under `/v1`, JSON in and out.

**Errors** — every error has the shape `{ "code": string, "message": string, "details"?: object }` with a matching HTTP status. Validation errors are `400 validation_error` with `details.fields` (field → message). Rate limits return `429 rate_limited` with `Retry-After`.

**Auth**

| Caller | How |
|---|---|
| Dashboard user | `Authorization: Bearer <Supabase access token>` + `X-Restaurant-Id: <uuid>` for tenant routes |
| Diner | `X-Session-Token: <table session JWT>` from `POST /v1/public/sessions` |
| Platform admin | Bearer token of a user with `is_platform_admin`; second factor (aal2) required in production |

**Idempotency** — `Idempotency-Key` (8–100 chars) is required on `POST /v1/public/orders`, `POST /v1/orders` and `POST /v1/wallet/recharges`. A replay with the same body returns the stored response; a different body returns `422 idempotency_mismatch`.

Money is always integer **paise**; tax rates are **basis points**.

## Public (diner)

| Method | Path | Notes |
|---|---|---|
| GET | `/public/restaurants/:slug/menu?locale=en\|hi\|mr` | Full menu in one response (cached, revalidated on change). Includes `isOpen`, `orderingAvailable`. |
| POST | `/public/sessions` | `{ qr }` → `{ sessionId, token, table, restaurant, orders, runningTotalPaise }`. Joins the open session of the table. `404 invalid_qr` for old/forged codes. |
| GET | `/public/sessions/current` | Session with orders. `401` once the session is closed or idle for 4 hours. |
| GET | `/public/sessions/current/bill` | Itemised bill for the table. |
| GET | `/public/sessions/current/requests` | This table's service requests. |
| POST | `/public/orders` | `{ lines: [{ itemId, variantId?, addonIds[], qty, note? }], note?, customerName?, customerPhone? }`. Server re-prices everything. `422 items_unavailable` with `details.unavailable[]`, `422 ordering_unavailable`, `429` above 10 orders / 10 min. |
| POST | `/public/service-requests` | `{ type: waiter\|water\|bill }`. 60-second cooldown per type (`429`). |
| POST | `/public/events` | Batched analytics `{ restaurantId, sessionId?, events: [{ type, itemId?, at? }] }`. |

## Account & restaurant

| Method | Path | Role |
|---|---|---|
| GET / PATCH | `/me` | any signed-in user |
| POST | `/invites/:token/accept` | signed-in user whose verified email/phone matches |
| POST | `/restaurants` | any signed-in user (becomes owner; wallet created) |
| GET / PATCH | `/restaurants/:id` | member / owner, manager (id must equal `X-Restaurant-Id`) |
| GET | `/restaurant`, `/restaurant/checklist` | member |
| GET | `/staff` | owner, manager |
| POST / DELETE | `/staff/invites`, `/staff/invites/:id` | owner, manager |
| PATCH / DELETE | `/staff/:membershipId` | owner, manager |
| POST | `/staff/:membershipId/transfer-ownership` | owner with both identifiers verified |
| POST | `/uploads` | `{ purpose: logo\|cover\|dish\|import, contentType, size }` → signed upload URL |

## Menu

| Method | Path | Role |
|---|---|---|
| GET | `/menu` (alias `/menu/categories`), `/menu/items` | member |
| POST / PATCH / DELETE | `/menu/categories`, `/menu/categories/:id` | owner, manager (`409 category_not_empty`) |
| POST / PATCH / DELETE | `/menu/items`, `/menu/items/:id` | owner, manager. Delete hides a dish that has orders. |
| PATCH | `/menu/items/:id/availability`, `/menu/addons/:id/availability` | owner, manager, waiter. Emits `menu.availability`. |
| POST | `/menu/reorder` | `{ categories?: uuid[], items?: [{ categoryId, itemIds[] }] }` |
| POST | `/menu/bulk-price` | `{ itemIds, mode: percent\|amount, value, roundTo }` (percent in bp) |
| GET / PUT | `/menu/translations?locale=` | manual corrections are never overwritten |
| GET / POST | `/menu/imports` | `{ filePaths[] }` (max 10, 5 per day) |
| GET / PATCH | `/menu/imports/:id` | review edits |
| POST | `/menu/imports/:id/retry`, `/menu/imports/:id/publish` | publish writes the menu in one transaction |

## Tables, orders, service, billing

| Method | Path | Role |
|---|---|---|
| GET / POST | `/tables`, `/tables/bulk` | member / owner, manager |
| PATCH | `/tables/:id` | owner, manager |
| POST | `/tables/:id/rotate-qr` | owner, manager — old printed codes stop working |
| GET | `/tables/qr.pdf?ids=` | owner, manager — A6 tent cards |
| GET | `/orders?status=&sessionId=&date=&limit=&cursor=`, `/orders/live` | member |
| POST | `/orders` | owner, manager, waiter — `{ tableId, lines… }`, accepted at creation |
| PATCH | `/orders/:id/status` | `{ status, reason? }` — state machine + role rules below |
| DELETE | `/orders/:id/items/:itemId` | owner, manager, waiter — only before Preparing |
| GET | `/service-requests` | owner, manager, waiter |
| PATCH | `/service-requests/:id/ack` | owner, manager, waiter |
| GET | `/sessions/:id/bill` | owner, manager, waiter |
| POST | `/sessions/:id/bill/discount` | owner, manager |
| POST | `/sessions/:id/bill/paid` | `{ paidVia: cash\|upi\|card\|online }` — freezes the bill, closes the session |
| POST | `/sessions/:id/close` | `{ paidVia? }` |

Order states: `placed → accepted → preparing → ready → served`; `placed → rejected` (reason required); `accepted|preparing → cancelled` (reason required). Kitchen: accepted→preparing→ready. Waiter: accept/reject, ready→served, accepted→cancelled. Owner/manager: all. Accepting charges the order fee in the same transaction.

## Wallet & payments

| Method | Path | Role |
|---|---|---|
| GET | `/wallet` | owner, manager — balance, month usage vs cap, pricing, grace |
| GET | `/wallet/ledger?limit=&cursor=` | owner, manager — append-only ledger |
| GET | `/wallet/invoices`, `/wallet/invoices/:id` (HTML) | owner, manager |
| GET | `/wallet/payments`, `/wallet/payments/:reference` | owner, manager — polling a pending payment reconciles it with the provider |
| POST | `/wallet/recharges` | `{ amountPaise, purpose: wallet_recharge\|flat_plan }` → `{ checkoutUrl, reference, amountPaise (incl. GST), creditPaise }` |
| POST | `/webhooks/:provider/:merchantAccountId` | provider → us; raw-body signature check; `platform` for the env-configured account |
| GET | `/pay/:reference` | hosted bridge page (Razorpay checkout / mock in development) |
| POST | `/payments/:reference/verify` | browser callback; verifies signature then polls provider |

Credit is applied only after a verified webhook or verified status poll, exactly once per payment.

## Insights

`GET /insights?days=7|30|90` — sales by day/hour, top dishes, viewed-but-not-ordered, scan-to-order rate.

## Platform admin (`/v1/admin`)

`GET /restaurants?search=&status=`, `GET /restaurants/:id`, `PATCH /restaurants/:id/status` `{ status, reason }`, `PUT /restaurants/:id/feature-flags`, `POST /wallet-adjustments` `{ restaurantId, amountPaise, reason }`, `GET|PUT /pricing-config`, `GET /imports`, `POST /imports/:id/retry`, `GET|POST /merchant-accounts`, `PATCH /merchant-accounts/:id`, `GET /metrics`, `GET /audit-logs?action=&restaurantId=`. Every write is audited. Admins can also open any dashboard read-only (GET with `X-Restaurant-Id`), logged as `support.access`.

## Realtime (Socket.IO, path `/socket.io`)

Handshake `auth: { token }` (dashboard) then emit `join.restaurant { restaurantId }`; or `auth: { sessionToken }` (diner). Rooms: `restaurant:{id}:kitchen|floor|owner`, `session:{id}`. Events: `order.created`, `order.updated`, `request.created`, `request.updated`, `menu.availability`, `session.updated`, `wallet.updated`. Clients fall back to polling every 10 s while disconnected.
