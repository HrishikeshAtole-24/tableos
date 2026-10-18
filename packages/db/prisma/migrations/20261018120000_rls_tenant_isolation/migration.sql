-- Tenant isolation, layer 2 (spec §3.9).
--
-- 1. RLS is enabled on every table. Supabase exposes the public schema through PostgREST to the
--    `anon` and `authenticated` roles; with RLS on and no policy for those roles, they can read or
--    write nothing. All data access goes through the TableOS API.
-- 2. A dedicated `tableos_api` role (no BYPASSRLS) gets tenant policies keyed on the
--    per-transaction setting `app.restaurant_id`. When the API runs as this role it must
--    `SET LOCAL app.restaurant_id = '<uuid>'` inside each tenant transaction; unscoped jobs set
--    `app.bypass_tenant = 'on'`. In local development the API connects as `postgres`, which bypasses RLS.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tableos_api') THEN
    CREATE ROLE tableos_api NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO tableos_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tableos_api;

CREATE OR REPLACE FUNCTION app_tenant_ok(rid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.bypass_tenant', true) = 'on'
      OR (rid IS NOT NULL AND rid::text = current_setting('app.restaurant_id', true))
$$;

ALTER TABLE "restaurants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addon_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "table_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_months" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pricing_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "merchant_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "restaurants" TO tableos_api USING (app_tenant_ok(id)) WITH CHECK (app_tenant_ok(id));
CREATE POLICY tenant_isolation ON "memberships" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "staff_invites" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "menu_categories" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "menu_items" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "item_variants" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "addon_groups" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "addons" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "translations" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "menu_imports" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "tables" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "table_sessions" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "orders" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "order_items" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "service_requests" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "bills" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "wallets" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "wallet_ledger" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "usage_months" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "pricing_config" TO tableos_api USING (app_tenant_ok(restaurant_id) OR (restaurant_id IS NULL AND current_setting('app.bypass_tenant', true) = 'on')) WITH CHECK (app_tenant_ok(restaurant_id) OR (restaurant_id IS NULL AND current_setting('app.bypass_tenant', true) = 'on'));
CREATE POLICY tenant_isolation ON "invoices" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "merchant_accounts" TO tableos_api USING (app_tenant_ok(restaurant_id) OR (restaurant_id IS NULL AND current_setting('app.bypass_tenant', true) = 'on')) WITH CHECK (app_tenant_ok(restaurant_id) OR (restaurant_id IS NULL AND current_setting('app.bypass_tenant', true) = 'on'));
CREATE POLICY tenant_isolation ON "payments" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "events" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY tenant_isolation ON "daily_stats" TO tableos_api USING (app_tenant_ok(restaurant_id)) WITH CHECK (app_tenant_ok(restaurant_id));
CREATE POLICY api_unscoped ON "users" TO tableos_api USING (true) WITH CHECK (true);
CREATE POLICY api_unscoped ON "payment_attempts" TO tableos_api USING (true) WITH CHECK (true);
CREATE POLICY api_unscoped ON "webhook_events" TO tableos_api USING (true) WITH CHECK (true);
CREATE POLICY api_unscoped ON "idempotency_keys" TO tableos_api USING (true) WITH CHECK (true);
CREATE POLICY api_unscoped ON "audit_logs" TO tableos_api USING (true) WITH CHECK (true);
