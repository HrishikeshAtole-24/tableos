-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'manager', 'waiter', 'kitchen');

-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('pending', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('payg', 'flat');

-- CreateEnum
CREATE TYPE "Diet" AS ENUM ('veg', 'nonveg', 'egg');

-- CreateEnum
CREATE TYPE "TranslationSource" AS ENUM ('ai', 'manual');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('queued', 'processing', 'ready', 'failed', 'published');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('open', 'bill_requested', 'closed');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('placed', 'accepted', 'preparing', 'ready', 'served', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "PlacedBy" AS ENUM ('diner', 'staff');

-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('waiter', 'water', 'bill');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('open', 'paid', 'void');

-- CreateEnum
CREATE TYPE "PaidVia" AS ENUM ('cash', 'upi', 'card', 'online');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('recharge', 'order_fee', 'adjustment', 'refund', 'flat_plan');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('wallet_recharge', 'flat_plan', 'diner_bill');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('created', 'pending', 'succeeded', 'failed', 'expired', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "MerchantAccountStatus" AS ENUM ('active', 'disabled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "phone" TEXT,
    "phone_verified_at" TIMESTAMP(3),
    "name" TEXT,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "slug_changed_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "address" TEXT,
    "city" TEXT,
    "cuisine" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gstin" TEXT,
    "fssai_no" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "languages" TEXT[] DEFAULT ARRAY['en', 'hi', 'mr']::TEXT[],
    "theme" JSONB NOT NULL DEFAULT '{"primary":"#FC8019"}',
    "opening_hours" JSONB NOT NULL DEFAULT '{}',
    "ordering_enabled" BOOLEAN NOT NULL DEFAULT true,
    "require_first_order_acceptance" BOOLEAN NOT NULL DEFAULT true,
    "service_charge_bp" INTEGER NOT NULL DEFAULT 0,
    "google_review_url" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'payg',
    "flat_plan_until" TIMESTAMP(3),
    "status" "RestaurantStatus" NOT NULL DEFAULT 'active',
    "qr_downloaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "token" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "diet" "Diet" NOT NULL DEFAULT 'veg',
    "jain_available" BOOLEAN NOT NULL DEFAULT false,
    "spice_level" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "base_price_paise" INTEGER NOT NULL,
    "tax_rate_bp" INTEGER NOT NULL DEFAULT 500,
    "photo_url" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_variants" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_groups" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addon_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addons" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" "TranslationSource" NOT NULL DEFAULT 'ai',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_imports" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'queued',
    "file_urls" TEXT[],
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT,
    "qr_version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_sessions" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "business_date" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'placed',
    "placed_by" "PlacedBy" NOT NULL,
    "placed_by_user_id" UUID,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "note" TEXT,
    "subtotal_paise" INTEGER NOT NULL,
    "tax_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "preparing_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "served_at" TIMESTAMP(3),
    "fee_charged_paise" INTEGER NOT NULL DEFAULT 0,
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "variant_snapshot" JSONB,
    "addons_snapshot" JSONB NOT NULL DEFAULT '[]',
    "unit_price_paise" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "tax_rate_bp" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" "ServiceRequestType" NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'open',
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "subtotal_paise" INTEGER NOT NULL DEFAULT 0,
    "tax_paise" INTEGER NOT NULL DEFAULT 0,
    "service_charge_paise" INTEGER NOT NULL DEFAULT 0,
    "discount_paise" INTEGER NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "round_off_paise" INTEGER NOT NULL DEFAULT 0,
    "total_paise" INTEGER NOT NULL DEFAULT 0,
    "status" "BillStatus" NOT NULL DEFAULT 'open',
    "paid_via" "PaidVia",
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "balance_paise" INTEGER NOT NULL DEFAULT 0,
    "zero_reached_at" TIMESTAMP(3),
    "ordering_paused" BOOLEAN NOT NULL DEFAULT false,
    "last_alert_level_paise" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_ledger" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "balance_after_paise" INTEGER NOT NULL,
    "order_id" UUID,
    "payment_id" UUID,
    "month_key" TEXT NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_months" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "month_key" TEXT NOT NULL,
    "accepted_orders" INTEGER NOT NULL DEFAULT 0,
    "fees_charged_paise" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_config" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID,
    "fee_per_order_paise" INTEGER NOT NULL DEFAULT 200,
    "monthly_cap_paise" INTEGER NOT NULL DEFAULT 99900,
    "flat_plan_paise" INTEGER NOT NULL DEFAULT 99900,
    "min_recharge_paise" INTEGER NOT NULL DEFAULT 20000,
    "alert_levels" INTEGER[] DEFAULT ARRAY[10000, 2000]::INTEGER[],
    "grace_floor_paise" INTEGER NOT NULL DEFAULT -10000,
    "grace_hours" INTEGER NOT NULL DEFAULT 48,
    "gst_rate_bp" INTEGER NOT NULL DEFAULT 1800,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "gst_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_accounts" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "credentials_encrypted" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "methods" TEXT[] DEFAULT ARRAY['upi', 'card', 'netbanking']::TEXT[],
    "status" "MerchantAccountStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "bill_id" UUID,
    "amount_paise" INTEGER NOT NULL,
    "credit_paise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'created',
    "method" TEXT,
    "initiated_by" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "succeeded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "merchant_account_id" UUID,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "provider_payment_id" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'created',
    "raw_status" TEXT,
    "checkout" JSONB,
    "raw_response" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" INTEGER,
    "response" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "session_id" UUID,
    "item_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "menu_views" INTEGER NOT NULL DEFAULT 0,
    "item_views" INTEGER NOT NULL DEFAULT 0,
    "add_to_carts" INTEGER NOT NULL DEFAULT 0,
    "orders_placed" INTEGER NOT NULL DEFAULT 0,
    "orders_accepted" INTEGER NOT NULL DEFAULT 0,
    "sales_paise" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "restaurant_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "restaurants_status_idx" ON "restaurants"("status");

-- CreateIndex
CREATE INDEX "memberships_restaurant_id_role_idx" ON "memberships"("restaurant_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_restaurant_id_key" ON "memberships"("user_id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_key" ON "staff_invites"("token");

-- CreateIndex
CREATE INDEX "staff_invites_restaurant_id_accepted_at_idx" ON "staff_invites"("restaurant_id", "accepted_at");

-- CreateIndex
CREATE INDEX "menu_categories_restaurant_id_sort_order_idx" ON "menu_categories"("restaurant_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_items_restaurant_id_category_id_sort_order_idx" ON "menu_items"("restaurant_id", "category_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_items_restaurant_id_available_idx" ON "menu_items"("restaurant_id", "available");

-- CreateIndex
CREATE INDEX "item_variants_restaurant_id_item_id_idx" ON "item_variants"("restaurant_id", "item_id");

-- CreateIndex
CREATE INDEX "addon_groups_restaurant_id_item_id_idx" ON "addon_groups"("restaurant_id", "item_id");

-- CreateIndex
CREATE INDEX "addons_restaurant_id_group_id_idx" ON "addons"("restaurant_id", "group_id");

-- CreateIndex
CREATE INDEX "translations_restaurant_id_locale_idx" ON "translations"("restaurant_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "translations_entity_type_entity_id_locale_field_key" ON "translations"("entity_type", "entity_id", "locale", "field");

-- CreateIndex
CREATE INDEX "menu_imports_restaurant_id_created_at_idx" ON "menu_imports"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "menu_imports_status_idx" ON "menu_imports"("status");

-- CreateIndex
CREATE INDEX "tables_restaurant_id_active_idx" ON "tables"("restaurant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "tables_restaurant_id_label_key" ON "tables"("restaurant_id", "label");

-- CreateIndex
CREATE INDEX "table_sessions_restaurant_id_status_idx" ON "table_sessions"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "table_sessions_table_id_status_idx" ON "table_sessions"("table_id", "status");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_status_idx" ON "orders"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_created_at_idx" ON "orders"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_session_id_idx" ON "orders"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurant_id_business_date_number_key" ON "orders"("restaurant_id", "business_date", "number");

-- CreateIndex
CREATE INDEX "order_items_restaurant_id_order_id_idx" ON "order_items"("restaurant_id", "order_id");

-- CreateIndex
CREATE INDEX "order_items_restaurant_id_item_id_idx" ON "order_items"("restaurant_id", "item_id");

-- CreateIndex
CREATE INDEX "service_requests_restaurant_id_status_idx" ON "service_requests"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_session_id_type_created_at_idx" ON "service_requests"("session_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bills_session_id_key" ON "bills"("session_id");

-- CreateIndex
CREATE INDEX "bills_restaurant_id_status_idx" ON "bills"("restaurant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_restaurant_id_key" ON "wallets"("restaurant_id");

-- CreateIndex
CREATE INDEX "wallet_ledger_restaurant_id_created_at_idx" ON "wallet_ledger"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_ledger_restaurant_id_month_key_idx" ON "wallet_ledger"("restaurant_id", "month_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_payment_id_type_key" ON "wallet_ledger"("payment_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "usage_months_restaurant_id_month_key_key" ON "usage_months"("restaurant_id", "month_key");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_config_restaurant_id_key" ON "pricing_config"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_id_key" ON "invoices"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_restaurant_id_issued_at_idx" ON "invoices"("restaurant_id", "issued_at");

-- CreateIndex
CREATE INDEX "merchant_accounts_restaurant_id_status_priority_idx" ON "merchant_accounts"("restaurant_id", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_created_at_idx" ON "payments"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_attempts_payment_id_idx" ON "payment_attempts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_provider_ref_key" ON "payment_attempts"("provider", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- CreateIndex
CREATE INDEX "events_restaurant_id_type_created_at_idx" ON "events"("restaurant_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_restaurant_id_date_key" ON "daily_stats"("restaurant_id", "date");

-- CreateIndex
CREATE INDEX "audit_logs_restaurant_id_created_at_idx" ON "audit_logs"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_groups" ADD CONSTRAINT "addon_groups_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_groups" ADD CONSTRAINT "addon_groups_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addons" ADD CONSTRAINT "addons_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addons" ADD CONSTRAINT "addons_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "addon_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_imports" ADD CONSTRAINT "menu_imports_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_months" ADD CONSTRAINT "usage_months_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_accounts" ADD CONSTRAINT "merchant_accounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_merchant_account_id_fkey" FOREIGN KEY ("merchant_account_id") REFERENCES "merchant_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
