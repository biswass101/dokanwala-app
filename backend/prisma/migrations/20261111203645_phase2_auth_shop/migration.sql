-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "LanguageCode" AS ENUM ('bn', 'en');

-- CreateEnum
CREATE TYPE "DigitStyle" AS ENUM ('bn', 'en');

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "name_bn" VARCHAR(150) NOT NULL,
    "name_en" VARCHAR(150),
    "address_bn" VARCHAR(300),
    "address_en" VARCHAR(300),
    "phone" VARCHAR(20),
    "logo_url" VARCHAR(500),
    "currency_code" VARCHAR(10) NOT NULL DEFAULT 'BDT',
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'Asia/Dhaka',
    "default_language" "LanguageCode" NOT NULL DEFAULT 'bn',
    "default_digit_style" "DigitStyle" NOT NULL DEFAULT 'bn',
    "receipt_header_bn" VARCHAR(300),
    "receipt_footer_bn" VARCHAR(300),
    "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false,
    "employee_can_give_credit" BOOLEAN NOT NULL DEFAULT true,
    "employee_max_discount_percent" INTEGER NOT NULL DEFAULT 10,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "password_hash" TEXT NOT NULL,
    "pin_hash" TEXT,
    "preferred_language" "LanguageCode" NOT NULL DEFAULT 'bn',
    "preferred_digit_style" "DigitStyle" NOT NULL DEFAULT 'bn',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "token_family" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "device_id" VARCHAR(120),
    "device_name" VARCHAR(120),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_session_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "device_id" VARCHAR(120),
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(80),
    "before_json" JSONB,
    "after_json" JSONB,
    "ip_address" VARCHAR(64),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_shop_id_is_active_idx" ON "users"("shop_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_revoked_at_idx" ON "refresh_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_sessions_token_family_idx" ON "refresh_sessions"("token_family");

-- CreateIndex
CREATE INDEX "audit_logs_shop_id_occurred_at_idx" ON "audit_logs"("shop_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
