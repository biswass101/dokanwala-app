-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS "sync_seq_global" START WITH 1 INCREMENT BY 1;

-- CreateEnum
CREATE TYPE "SyncOperationStatus" AS ENUM ('APPLIED', 'CONFLICT', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncChangeAction" AS ENUM ('UPSERT', 'DELETE');

-- CreateTable
CREATE TABLE "sync_operations" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "device_id" VARCHAR(120),
    "client_op_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "op_type" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID NOT NULL,
    "status" "SyncOperationStatus" NOT NULL,
    "sync_seq" BIGINT NOT NULL DEFAULT nextval('sync_seq_global'),
    "result_json" JSONB,
    "error_code" VARCHAR(60),
    "error_message" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_changes" (
    "sync_seq" BIGINT NOT NULL DEFAULT nextval('sync_seq_global'),
    "shop_id" UUID NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "SyncChangeAction" NOT NULL DEFAULT 'UPSERT',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_changes_pkey" PRIMARY KEY ("sync_seq")
);

-- CreateIndex
CREATE INDEX "sync_operations_shop_id_sync_seq_idx" ON "sync_operations"("shop_id", "sync_seq" ASC);

-- CreateIndex
CREATE INDEX "sync_operations_shop_id_entity_type_entity_id_idx" ON "sync_operations"("shop_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_operations_shop_id_idempotency_key_key" ON "sync_operations"("shop_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sync_changes_shop_id_sync_seq_idx" ON "sync_changes"("shop_id", "sync_seq" ASC);

-- CreateIndex
CREATE INDEX "sync_changes_shop_id_entity_type_entity_id_idx" ON "sync_changes"("shop_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill monotonic sync_changes markers for pre-existing shop entities
INSERT INTO "sync_changes" ("shop_id", "entity_type", "entity_id", "action", "occurred_at")
SELECT "shop_id", 'CATEGORY', "id", CASE WHEN "deleted_at" IS NULL THEN 'UPSERT'::"SyncChangeAction" ELSE 'DELETE'::"SyncChangeAction" END, "updated_at" FROM "categories"
UNION ALL
SELECT "shop_id", 'UNIT', "id", 'UPSERT'::"SyncChangeAction", "updated_at" FROM "units"
UNION ALL
SELECT "shop_id", 'PRODUCT', "id", CASE WHEN "deleted_at" IS NULL THEN 'UPSERT'::"SyncChangeAction" ELSE 'DELETE'::"SyncChangeAction" END, "updated_at" FROM "products"
UNION ALL
SELECT "shop_id", 'CUSTOMER', "id", CASE WHEN "deleted_at" IS NULL THEN 'UPSERT'::"SyncChangeAction" ELSE 'DELETE'::"SyncChangeAction" END, "updated_at" FROM "customers"
UNION ALL
SELECT "shop_id", 'SALE', "id", 'UPSERT'::"SyncChangeAction", "updated_at" FROM "sales"
UNION ALL
SELECT "shop_id", 'SUPPLIER', "id", CASE WHEN "deleted_at" IS NULL THEN 'UPSERT'::"SyncChangeAction" ELSE 'DELETE'::"SyncChangeAction" END, "updated_at" FROM "suppliers"
UNION ALL
SELECT "shop_id", 'PURCHASE', "id", 'UPSERT'::"SyncChangeAction", "updated_at" FROM "purchases"
UNION ALL
SELECT "shop_id", 'EXPENSE_CATEGORY', "id", CASE WHEN "deleted_at" IS NULL THEN 'UPSERT'::"SyncChangeAction" ELSE 'DELETE'::"SyncChangeAction" END, "updated_at" FROM "expense_categories"
UNION ALL
SELECT "shop_id", 'EXPENSE', "id", 'UPSERT'::"SyncChangeAction", "updated_at" FROM "expenses"
UNION ALL
SELECT "shop_id", 'CASHBOOK_SESSION', "id", 'UPSERT'::"SyncChangeAction", "updated_at" FROM "cashbook_sessions";
