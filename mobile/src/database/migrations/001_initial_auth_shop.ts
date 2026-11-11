export const MIGRATION_001_AUTH_SHOP = `
  CREATE TABLE IF NOT EXISTS app_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shops_local (
    id TEXT PRIMARY KEY,
    name_bn TEXT NOT NULL,
    name_en TEXT,
    address_bn TEXT,
    address_en TEXT,
    phone TEXT,
    logo_url TEXT,
    currency_code TEXT NOT NULL,
    timezone TEXT NOT NULL,
    default_language TEXT NOT NULL,
    default_digit_style TEXT NOT NULL,
    receipt_header_bn TEXT,
    receipt_footer_bn TEXT,
    allow_negative_stock INTEGER NOT NULL DEFAULT 0,
    employee_can_give_credit INTEGER NOT NULL DEFAULT 1,
    employee_max_discount_percent INTEGER NOT NULL DEFAULT 10,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users_local (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    has_pin INTEGER NOT NULL DEFAULT 0,
    preferred_language TEXT NOT NULL,
    preferred_digit_style TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
`;
