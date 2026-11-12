-- CreateEnum
CREATE TYPE "CashbookSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashbookDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashbookEntryType" AS ENUM ('SALE_IN', 'DUE_COLLECTION_IN', 'PURCHASE_REFUND_IN', 'OWNER_CASH_IN', 'EXPENSE_ADJUST_IN', 'SALE_REFUND_OUT', 'SALE_CANCEL_OUT', 'PURCHASE_OUT', 'SUPPLIER_PAYMENT_OUT', 'EXPENSE_OUT', 'EXPENSE_ADJUST_OUT', 'OWNER_DRAWING_OUT');

-- CreateTable
CREATE TABLE "cashbook_sessions" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "business_date" VARCHAR(10) NOT NULL,
    "status" "CashbookSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opening_cash_poisha" INTEGER NOT NULL,
    "expected_closing_cash_poisha" INTEGER NOT NULL DEFAULT 0,
    "actual_closing_cash_poisha" INTEGER,
    "variance_poisha" INTEGER,
    "note" VARCHAR(300),
    "opened_by_user_id" UUID,
    "closed_by_user_id" UUID,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashbook_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashbook_entries" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "session_id" UUID,
    "direction" "CashbookDirection" NOT NULL,
    "entry_type" "CashbookEntryType" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_poisha" INTEGER NOT NULL,
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "reference_number" VARCHAR(60),
    "note" VARCHAR(300),
    "idempotency_key" VARCHAR(120),
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashbook_sessions_shop_id_business_date_idx" ON "cashbook_sessions"("shop_id", "business_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cashbook_sessions_shop_id_business_date_key" ON "cashbook_sessions"("shop_id", "business_date");

-- CreateIndex
CREATE INDEX "cashbook_entries_shop_id_occurred_at_method_idx" ON "cashbook_entries"("shop_id", "occurred_at" DESC, "method");

-- CreateIndex
CREATE INDEX "cashbook_entries_shop_id_session_id_occurred_at_idx" ON "cashbook_entries"("shop_id", "session_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "cashbook_entries_shop_id_reference_type_reference_id_idx" ON "cashbook_entries"("shop_id", "reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "cashbook_entries_shop_id_idempotency_key_key" ON "cashbook_entries"("shop_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "cashbook_sessions" ADD CONSTRAINT "cashbook_sessions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashbook_sessions" ADD CONSTRAINT "cashbook_sessions_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashbook_sessions" ADD CONSTRAINT "cashbook_sessions_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cashbook_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill Cashbook entries for pre-existing Phases 4-6 transactions
INSERT INTO "cashbook_entries" ("id", "shop_id", "direction", "entry_type", "method", "amount_poisha", "reference_type", "reference_id", "reference_number", "note", "actor_user_id", "occurred_at")
SELECT
  gen_random_uuid(),
  p."shop_id",
  'IN'::"CashbookDirection",
  'SALE_IN'::"CashbookEntryType",
  p."method",
  p."amount_poisha",
  'SALE',
  s."id",
  s."receipt_number",
  s."customer_name_snapshot",
  s."actor_user_id",
  p."received_at"
FROM "payments" p
JOIN "sales" s ON s."id" = p."sale_id"
WHERE p."amount_poisha" > 0;

INSERT INTO "cashbook_entries" ("id", "shop_id", "direction", "entry_type", "method", "amount_poisha", "reference_type", "reference_id", "reference_number", "note", "actor_user_id", "occurred_at")
SELECT
  gen_random_uuid(),
  p."shop_id",
  'OUT'::"CashbookDirection",
  'SALE_CANCEL_OUT'::"CashbookEntryType",
  p."method",
  p."amount_poisha",
  'SALE',
  s."id",
  s."receipt_number",
  s."cancel_reason",
  s."cancelled_by_user_id",
  COALESCE(s."cancelled_at", s."updated_at")
FROM "payments" p
JOIN "sales" s ON s."id" = p."sale_id"
WHERE s."status" = 'CANCELLED' AND p."amount_poisha" > 0;

INSERT INTO "cashbook_entries" ("id", "shop_id", "direction", "entry_type", "method", "amount_poisha", "reference_type", "reference_id", "reference_number", "note", "actor_user_id", "occurred_at")
SELECT
  gen_random_uuid(),
  sr."shop_id",
  'OUT'::"CashbookDirection",
  'SALE_REFUND_OUT'::"CashbookEntryType",
  sr."refund_method"::text::"PaymentMethod",
  sr."cash_refund_poisha",
  'SALE_RETURN',
  sr."id",
  sr."return_number",
  sr."reason",
  sr."actor_user_id",
  sr."returned_at"
FROM "sale_returns" sr
WHERE sr."cash_refund_poisha" > 0 AND sr."refund_method" <> 'CREDIT_ADJUSTMENT';

INSERT INTO "cashbook_entries" ("id", "shop_id", "direction", "entry_type", "method", "amount_poisha", "reference_type", "reference_id", "reference_number", "note", "actor_user_id", "occurred_at")
SELECT
  gen_random_uuid(),
  pr."shop_id",
  'OUT'::"CashbookDirection",
  'PURCHASE_OUT'::"CashbookEntryType",
  pr."payment_method",
  pr."paid_poisha",
  'PURCHASE',
  pr."id",
  pr."purchase_number",
  pr."supplier_name_snapshot",
  pr."actor_user_id",
  pr."purchased_at"
FROM "purchases" pr
WHERE pr."paid_poisha" > 0 AND pr."payment_method" IS NOT NULL;

INSERT INTO "cashbook_entries" ("id", "shop_id", "direction", "entry_type", "method", "amount_poisha", "reference_type", "reference_id", "reference_number", "note", "actor_user_id", "occurred_at")
SELECT
  gen_random_uuid(),
  prr."shop_id",
  'IN'::"CashbookDirection",
  'PURCHASE_REFUND_IN'::"CashbookEntryType",
  prr."refund_method"::text::"PaymentMethod",
  prr."cash_refund_poisha",
  'PURCHASE_RETURN',
  prr."id",
  prr."return_number",
  prr."reason",
  prr."actor_user_id",
  prr."returned_at"
FROM "purchase_returns" prr
WHERE prr."cash_refund_poisha" > 0 AND prr."refund_method" <> 'PAYABLE_ADJUSTMENT';

INSERT INTO "cashbook_entries" ("id", "shop_id", "direction", "entry_type", "method", "amount_poisha", "reference_type", "reference_id", "reference_number", "note", "actor_user_id", "occurred_at")
SELECT
  gen_random_uuid(),
  cp."shop_id",
  'IN'::"CashbookDirection",
  'DUE_COLLECTION_IN'::"CashbookEntryType",
  cp."method",
  cp."amount_poisha",
  'CUSTOMER_PAYMENT',
  cp."id",
  cp."reference",
  cp."note",
  cp."actor_user_id",
  cp."paid_at"
FROM "customer_payments" cp
WHERE cp."amount_poisha" > 0;

INSERT INTO "cashbook_entries" ("id", "shop_id", "direction", "entry_type", "method", "amount_poisha", "reference_type", "reference_id", "reference_number", "note", "actor_user_id", "occurred_at")
SELECT
  gen_random_uuid(),
  sp."shop_id",
  'OUT'::"CashbookDirection",
  'SUPPLIER_PAYMENT_OUT'::"CashbookEntryType",
  sp."method",
  sp."amount_poisha",
  'SUPPLIER_PAYMENT',
  sp."id",
  sp."reference",
  sp."note",
  sp."actor_user_id",
  sp."paid_at"
FROM "supplier_payments" sp
WHERE sp."amount_poisha" > 0;

INSERT INTO "cashbook_entries" ("id", "shop_id", "direction", "entry_type", "method", "amount_poisha", "reference_type", "reference_id", "reference_number", "note", "actor_user_id", "occurred_at")
SELECT
  gen_random_uuid(),
  e."shop_id",
  'OUT'::"CashbookDirection",
  'EXPENSE_OUT'::"CashbookEntryType",
  e."method",
  e."amount_poisha",
  'EXPENSE',
  e."id",
  e."category_name_snapshot",
  e."note",
  e."actor_user_id",
  e."incurred_at"
FROM "expenses" e
WHERE e."amount_poisha" > 0;
