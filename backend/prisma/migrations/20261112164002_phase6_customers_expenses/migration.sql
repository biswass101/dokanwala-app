-- CreateEnum
CREATE TYPE "ExpenseAuditAction" AS ENUM ('CREATED', 'UPDATED');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "settled_due_poisha" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "sale_id" UUID,
    "method" "PaymentMethod" NOT NULL,
    "amount_poisha" INTEGER NOT NULL,
    "reference" VARCHAR(120),
    "note" VARCHAR(300),
    "idempotency_key" VARCHAR(120),
    "actor_user_id" UUID,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "name_bn" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "category_name_snapshot" VARCHAR(120) NOT NULL,
    "amount_poisha" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(120),
    "note" VARCHAR(300),
    "incurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" VARCHAR(120),
    "actor_user_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_audit_logs" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "action" "ExpenseAuditAction" NOT NULL,
    "edited_by_id" UUID,
    "before_json" JSONB,
    "after_json" JSONB NOT NULL,
    "reason" VARCHAR(300),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_payments_shop_id_customer_id_paid_at_idx" ON "customer_payments"("shop_id", "customer_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "customer_payments_shop_id_paid_at_method_idx" ON "customer_payments"("shop_id", "paid_at" DESC, "method");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_shop_id_idempotency_key_key" ON "customer_payments"("shop_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "expense_categories_shop_id_is_active_deleted_at_sort_order_idx" ON "expense_categories"("shop_id", "is_active", "deleted_at", "sort_order");

-- CreateIndex
CREATE INDEX "expenses_shop_id_incurred_at_category_id_idx" ON "expenses"("shop_id", "incurred_at" DESC, "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_shop_id_idempotency_key_key" ON "expenses"("shop_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "expense_audit_logs_shop_id_expense_id_occurred_at_idx" ON "expense_audit_logs"("shop_id", "expense_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_audit_logs" ADD CONSTRAINT "expense_audit_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_audit_logs" ADD CONSTRAINT "expense_audit_logs_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_audit_logs" ADD CONSTRAINT "expense_audit_logs_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
