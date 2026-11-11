-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING_STOCK', 'PURCHASE_IN', 'SALE_OUT', 'RETURN_IN', 'PURCHASE_RETURN_OUT', 'COUNT_ADJUST', 'WASTAGE_OUT', 'DAMAGE_OUT', 'EXPIRED_OUT');

-- CreateEnum
CREATE TYPE "StockAdjustmentType" AS ENUM ('COUNT_ADJUST', 'WASTAGE', 'DAMAGE', 'EXPIRED');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "name_bn" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name_bn" VARCHAR(60) NOT NULL,
    "name_en" VARCHAR(60) NOT NULL,
    "is_fractional" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "category_id" UUID,
    "name_bn" VARCHAR(180) NOT NULL,
    "name_en" VARCHAR(180),
    "barcode" VARCHAR(80),
    "image_url" VARCHAR(500),
    "default_supplier_name" VARCHAR(150),
    "base_unit_id" UUID NOT NULL,
    "default_sale_unit_id" UUID NOT NULL,
    "default_purchase_unit_id" UUID NOT NULL,
    "base_selling_price_poisha" INTEGER NOT NULL,
    "last_purchase_price_poisha" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold_base" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_units" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "conversion_factor_to_base" DECIMAL(15,4) NOT NULL,
    "selling_price_poisha" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "product_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "qty_base" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "avg_cost_per_base_bdt" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "movement_type" "StockMovementType" NOT NULL,
    "delta_qty_base" DECIMAL(15,4) NOT NULL,
    "balance_after_base" DECIMAL(15,4) NOT NULL,
    "unit_cost_bdt" DECIMAL(18,6) NOT NULL,
    "value_poisha" INTEGER NOT NULL,
    "reference_type" VARCHAR(40),
    "reference_id" VARCHAR(80),
    "reason" VARCHAR(300),
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "adjustment_type" "StockAdjustmentType" NOT NULL,
    "qty_base" DECIMAL(15,4) NOT NULL,
    "delta_qty_base" DECIMAL(15,4) NOT NULL,
    "unit_cost_bdt" DECIMAL(18,6) NOT NULL,
    "loss_poisha" INTEGER NOT NULL,
    "reason" VARCHAR(300),
    "idempotency_key" VARCHAR(120),
    "actor_user_id" UUID,
    "adjusted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_shop_id_is_active_deleted_at_idx" ON "categories"("shop_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "categories_shop_id_sort_order_idx" ON "categories"("shop_id", "sort_order");

-- CreateIndex
CREATE INDEX "units_shop_id_idx" ON "units"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_shop_id_code_key" ON "units"("shop_id", "code");

-- CreateIndex
CREATE INDEX "products_shop_id_is_active_deleted_at_idx" ON "products"("shop_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "products_shop_id_category_id_idx" ON "products"("shop_id", "category_id");

-- CreateIndex
CREATE INDEX "products_shop_id_barcode_idx" ON "products"("shop_id", "barcode");

-- CreateIndex
CREATE INDEX "product_units_shop_id_product_id_idx" ON "product_units"("shop_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_product_id_unit_id_key" ON "product_units"("product_id", "unit_id");

-- CreateIndex
CREATE INDEX "inventory_balances_shop_id_idx" ON "inventory_balances"("shop_id");

-- CreateIndex
CREATE INDEX "stock_movements_shop_id_product_id_created_at_idx" ON "stock_movements"("shop_id", "product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_shop_id_movement_type_created_at_idx" ON "stock_movements"("shop_id", "movement_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_adjustments_shop_id_product_id_adjusted_at_idx" ON "stock_adjustments"("shop_id", "product_id", "adjusted_at" DESC);

-- CreateIndex
CREATE INDEX "stock_adjustments_shop_id_adjustment_type_adjusted_at_idx" ON "stock_adjustments"("shop_id", "adjustment_type", "adjusted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_shop_id_idempotency_key_key" ON "stock_adjustments"("shop_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_default_sale_unit_id_fkey" FOREIGN KEY ("default_sale_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_default_purchase_unit_id_fkey" FOREIGN KEY ("default_purchase_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial Unique Indexes (Soft-Delete Safe Uniqueness)
CREATE UNIQUE INDEX "categories_shop_name_bn_active_uidx" ON "categories" ("shop_id", "name_bn") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "products_shop_barcode_active_uidx" ON "products" ("shop_id", "barcode") WHERE "barcode" IS NOT NULL AND "deleted_at" IS NULL;

-- Fast Bilingual Trigram Search Indexes (Bangla & English substring search)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE INDEX "products_name_bn_trgm_idx" ON "products" USING GIN ("name_bn" gin_trgm_ops);
CREATE INDEX "products_name_en_trgm_idx" ON "products" USING GIN ("name_en" gin_trgm_ops);
