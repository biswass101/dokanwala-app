-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PurchaseRefundMethod" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'OTHER', 'PAYABLE_ADJUSTMENT');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "name_bn" VARCHAR(150) NOT NULL,
    "name_en" VARCHAR(150),
    "phone" VARCHAR(20),
    "address" VARCHAR(300),
    "note" VARCHAR(300),
    "total_purchased_poisha" INTEGER NOT NULL DEFAULT 0,
    "total_paid_poisha" INTEGER NOT NULL DEFAULT 0,
    "payable_poisha" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "purchase_number" VARCHAR(40) NOT NULL,
    "supplier_id" UUID,
    "supplier_name_snapshot" VARCHAR(150),
    "status" "PurchaseStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal_poisha" INTEGER NOT NULL,
    "discount_poisha" INTEGER NOT NULL DEFAULT 0,
    "total_poisha" INTEGER NOT NULL,
    "paid_poisha" INTEGER NOT NULL DEFAULT 0,
    "settled_due_poisha" INTEGER NOT NULL DEFAULT 0,
    "due_poisha" INTEGER NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod",
    "payment_reference" VARCHAR(120),
    "returned_total_poisha" INTEGER NOT NULL DEFAULT 0,
    "cash_refunded_poisha" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(300),
    "idempotency_key" VARCHAR(120),
    "actor_user_id" UUID,
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "product_name_bn" VARCHAR(180) NOT NULL,
    "product_name_en" VARCHAR(180),
    "unit_name_bn" VARCHAR(60) NOT NULL,
    "unit_name_en" VARCHAR(60) NOT NULL,
    "line_order" INTEGER NOT NULL DEFAULT 0,
    "qty_display" DECIMAL(15,4) NOT NULL,
    "conversion_factor_to_base" DECIMAL(15,4) NOT NULL,
    "qty_base" DECIMAL(15,4) NOT NULL,
    "returned_qty_base" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "unit_cost_poisha" INTEGER NOT NULL,
    "line_total_poisha" INTEGER NOT NULL,
    "net_cost_poisha" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "return_number" VARCHAR(40) NOT NULL,
    "refund_method" "PurchaseRefundMethod" NOT NULL,
    "subtotal_poisha" INTEGER NOT NULL,
    "discount_adjustment_poisha" INTEGER NOT NULL DEFAULT 0,
    "refund_total_poisha" INTEGER NOT NULL,
    "cash_refund_poisha" INTEGER NOT NULL DEFAULT 0,
    "payable_adjusted_poisha" INTEGER NOT NULL DEFAULT 0,
    "reason" VARCHAR(300),
    "idempotency_key" VARCHAR(120),
    "actor_user_id" UUID,
    "returned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "purchase_return_id" UUID NOT NULL,
    "purchase_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty_display" DECIMAL(15,4) NOT NULL,
    "qty_base" DECIMAL(15,4) NOT NULL,
    "unit_cost_poisha" INTEGER NOT NULL,
    "line_refund_poisha" INTEGER NOT NULL,
    "reversed_cost_poisha" INTEGER NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_id" UUID,
    "method" "PaymentMethod" NOT NULL,
    "amount_poisha" INTEGER NOT NULL,
    "reference" VARCHAR(120),
    "note" VARCHAR(300),
    "idempotency_key" VARCHAR(120),
    "actor_user_id" UUID,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_shop_id_is_active_deleted_at_idx" ON "suppliers"("shop_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "suppliers_shop_id_payable_poisha_idx" ON "suppliers"("shop_id", "payable_poisha");

-- CreateIndex
CREATE INDEX "suppliers_shop_id_phone_idx" ON "suppliers"("shop_id", "phone");

-- CreateIndex
CREATE INDEX "purchases_shop_id_purchased_at_status_idx" ON "purchases"("shop_id", "purchased_at" DESC, "status");

-- CreateIndex
CREATE INDEX "purchases_shop_id_supplier_id_purchased_at_idx" ON "purchases"("shop_id", "supplier_id", "purchased_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_shop_id_purchase_number_key" ON "purchases"("shop_id", "purchase_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_shop_id_idempotency_key_key" ON "purchases"("shop_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_line_order_idx" ON "purchase_items"("purchase_id", "line_order");

-- CreateIndex
CREATE INDEX "purchase_items_shop_id_product_id_created_at_idx" ON "purchase_items"("shop_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_returns_shop_id_purchase_id_returned_at_idx" ON "purchase_returns"("shop_id", "purchase_id", "returned_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_shop_id_return_number_key" ON "purchase_returns"("shop_id", "return_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_shop_id_idempotency_key_key" ON "purchase_returns"("shop_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_return_items_purchase_return_id_idx" ON "purchase_return_items"("purchase_return_id");

-- CreateIndex
CREATE INDEX "purchase_return_items_purchase_item_id_idx" ON "purchase_return_items"("purchase_item_id");

-- CreateIndex
CREATE INDEX "supplier_payments_shop_id_supplier_id_paid_at_idx" ON "supplier_payments"("shop_id", "supplier_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "supplier_payments_shop_id_paid_at_method_idx" ON "supplier_payments"("shop_id", "paid_at" DESC, "method");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_shop_id_idempotency_key_key" ON "supplier_payments"("shop_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
