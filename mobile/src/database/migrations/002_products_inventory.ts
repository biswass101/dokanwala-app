export const MIGRATION_002_PRODUCTS_INVENTORY = `
CREATE TABLE IF NOT EXISTS categories_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_local_shop ON categories_local (shop_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS units_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_fractional INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_units_local_shop ON units_local (shop_id, code);

CREATE TABLE IF NOT EXISTS products_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  category_id TEXT,
  category_name_bn TEXT,
  category_name_en TEXT,
  name_bn TEXT NOT NULL,
  name_en TEXT,
  barcode TEXT,
  image_url TEXT,
  default_supplier_name TEXT,
  base_unit_id TEXT NOT NULL,
  base_unit_code TEXT NOT NULL,
  base_unit_name_bn TEXT NOT NULL,
  base_unit_name_en TEXT NOT NULL,
  default_sale_unit_id TEXT NOT NULL,
  default_purchase_unit_id TEXT NOT NULL,
  base_selling_price_poisha INTEGER NOT NULL,
  last_purchase_price_poisha INTEGER,
  low_stock_threshold_base TEXT NOT NULL,
  is_low_stock INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_local_shop_active ON products_local (shop_id, is_active, category_id);
CREATE INDEX IF NOT EXISTS idx_products_local_barcode ON products_local (shop_id, barcode);

CREATE TABLE IF NOT EXISTS product_units_local (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_name_bn TEXT NOT NULL,
  unit_name_en TEXT NOT NULL,
  is_fractional INTEGER NOT NULL DEFAULT 0,
  conversion_factor_to_base TEXT NOT NULL,
  selling_price_poisha INTEGER,
  is_base_unit INTEGER NOT NULL DEFAULT 0,
  is_default_sale_unit INTEGER NOT NULL DEFAULT 0,
  is_default_purchase_unit INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_product_units_local_product ON product_units_local (product_id);

CREATE TABLE IF NOT EXISTS inventory_balances_local (
  product_id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  qty_base TEXT NOT NULL,
  avg_cost_per_base_bdt TEXT,
  valuation_poisha INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_local_shop ON inventory_balances_local (shop_id);
`;
