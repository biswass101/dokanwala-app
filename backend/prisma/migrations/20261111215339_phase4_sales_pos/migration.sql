-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'OTHER');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED_POISHA', 'PERCENT');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'OTHER', 'CREDIT_ADJUSTMENT');

-- DropIndex
DROP INDEX "products_name_bn_trgm_idx";

-- DropIndex
DROP INDEX "products_name_en_trgm_idx";

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "name_bn" VARCHAR(150) NOT NULL,
    "name_en" VARCHAR(150),
    "phone" VARCHAR(20),
    "address" VARCHAR(300),
    "note" VARCHAR(300),
    "total_purchased_poisha" INTEGER NOT NULL DEFAULT 0,
    "total_paid_poisha" INTEGER NOT NULL DEFAULT 0,
    "due_poisha" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "receipt_number" VARCHAR(40) NOT NULL,
    "customer_id" UUID,
    "customer_name_snapshot" VARCHAR(150),
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal_poisha" INTEGER NOT NULL,
    "discount_type" "DiscountType" NOT NULL DEFAULT 'FIXED_POISHA',
    "discount_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_poisha" INTEGER NOT NULL DEFAULT 0,
    "total_poisha" INTEGER NOT NULL,
    "paid_poisha" INTEGER NOT NULL DEFAULT 0,
    "due_poisha" INTEGER NOT NULL DEFAULT 0,
    "tendered_poisha" INTEGER,
    "change_poisha" INTEGER NOT NULL DEFAULT 0,
    "returned_total_poisha" INTEGER NOT NULL DEFAULT 0,
    "cash_refunded_poisha" INTEGER NOT NULL DEFAULT 0,
    "cogs_poisha" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(300),
    "idempotency_key" VARCHAR(120),
    "cancel_idempotency_key" VARCHAR(120),
    "cancel_reason" VARCHAR(300),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" UUID,
    "actor_user_id" UUID,
    "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "product_name_bn" VARCHAR(180) NOT NULL,
    "product_name_en" VARCHAR(180),
    "unit_name_bn" VARCHAR(60) NOT NULL,
    "unit_name_en" VARCHAR(60) NOT NULL,
    "qty_display" DECIMAL(15,4) NOT NULL,
    "conversion_factor_to_base" DECIMAL(15,4) NOT NULL,
    "qty_base" DECIMAL(15,4) NOT NULL,
    "returned_qty_base" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "unit_selling_price_poisha" INTEGER NOT NULL,
    "unit_cost_at_sale_bdt" DECIMAL(18,6) NOT NULL,
    "line_subtotal_poisha" INTEGER NOT NULL,
    "line_cogs_poisha" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_poisha" INTEGER NOT NULL,
    "reference" VARCHAR(120),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "return_number" VARCHAR(40) NOT NULL,
    "refund_method" "RefundMethod" NOT NULL,
    "subtotal_poisha" INTEGER NOT NULL,
    "discount_adjustment_poisha" INTEGER NOT NULL DEFAULT 0,
    "refund_total_poisha" INTEGER NOT NULL,
    "cash_refund_poisha" INTEGER NOT NULL DEFAULT 0,
    "credit_adjusted_poisha" INTEGER NOT NULL DEFAULT 0,
    "reason" VARCHAR(300),
    "idempotency_key" VARCHAR(120),
    "actor_user_id" UUID,
    "returned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "sale_return_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty_display" DECIMAL(15,4) NOT NULL,
    "qty_base" DECIMAL(15,4) NOT NULL,
    "unit_selling_price_poisha" INTEGER NOT NULL,
    "line_refund_poisha" INTEGER NOT NULL,
    "restored_cogs_poisha" INTEGER NOT NULL,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_shop_id_is_active_deleted_at_idx" ON "customers"("shop_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "customers_shop_id_due_poisha_idx" ON "customers"("shop_id", "due_poisha");

-- CreateIndex
CREATE INDEX "customers_shop_id_phone_idx" ON "customers"("shop_id", "phone");

-- CreateIndex
CREATE INDEX "sales_shop_id_sold_at_status_idx" ON "sales"("shop_id", "sold_at" DESC, "status");

-- CreateIndex
CREATE INDEX "sales_shop_id_customer_id_sold_at_idx" ON "sales"("shop_id", "customer_id", "sold_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sales_shop_id_receipt_number_key" ON "sales"("shop_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_shop_id_idempotency_key_key" ON "sales"("shop_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "sales_shop_id_cancel_idempotency_key_key" ON "sales"("shop_id", "cancel_idempotency_key");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_shop_id_product_id_created_at_idx" ON "sale_items"("shop_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_sale_id_idx" ON "payments"("sale_id");

-- CreateIndex
CREATE INDEX "payments_shop_id_received_at_method_idx" ON "payments"("shop_id", "received_at" DESC, "method");

-- CreateIndex
CREATE INDEX "sale_returns_shop_id_sale_id_returned_at_idx" ON "sale_returns"("shop_id", "sale_id", "returned_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_shop_id_return_number_key" ON "sale_returns"("shop_id", "return_number");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_shop_id_idempotency_key_key" ON "sale_returns"("shop_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sale_return_items_sale_return_id_idx" ON "sale_return_items"("sale_return_id");

-- CreateIndex
CREATE INDEX "sale_return_items_sale_item_id_idx" ON "sale_return_items"("sale_item_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
