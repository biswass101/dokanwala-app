export const MIGRATION_003_SALES_POS = `
CREATE TABLE IF NOT EXISTS customers_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT,
  phone TEXT,
  address TEXT,
  note TEXT,
  total_purchased_poisha INTEGER NOT NULL DEFAULT 0,
  total_paid_poisha INTEGER NOT NULL DEFAULT 0,
  due_poisha INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_local_shop ON customers_local (shop_id, is_active, due_poisha);

CREATE TABLE IF NOT EXISTS sales_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  customer_id TEXT,
  customer_name_snapshot TEXT,
  status TEXT NOT NULL,
  subtotal_poisha INTEGER NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value TEXT NOT NULL,
  discount_poisha INTEGER NOT NULL DEFAULT 0,
  total_poisha INTEGER NOT NULL,
  paid_poisha INTEGER NOT NULL DEFAULT 0,
  due_poisha INTEGER NOT NULL DEFAULT 0,
  tendered_poisha INTEGER,
  change_poisha INTEGER NOT NULL DEFAULT 0,
  returned_total_poisha INTEGER NOT NULL DEFAULT 0,
  cash_refunded_poisha INTEGER NOT NULL DEFAULT 0,
  cogs_poisha INTEGER,
  estimated_profit_poisha INTEGER,
  note TEXT,
  actor_user_id TEXT,
  actor_name TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  sold_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_local_shop_sold_at ON sales_local (shop_id, sold_at DESC);

CREATE TABLE IF NOT EXISTS sale_items_local (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  product_name_bn TEXT NOT NULL,
  product_name_en TEXT,
  unit_name_bn TEXT NOT NULL,
  unit_name_en TEXT NOT NULL,
  qty_display TEXT NOT NULL,
  conversion_factor_to_base TEXT NOT NULL,
  qty_base TEXT NOT NULL,
  returned_qty_base TEXT NOT NULL DEFAULT '0.0000',
  unit_selling_price_poisha INTEGER NOT NULL,
  unit_cost_at_sale_bdt TEXT,
  line_subtotal_poisha INTEGER NOT NULL,
  line_cogs_poisha INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sale_items_local_sale ON sale_items_local (sale_id);

CREATE TABLE IF NOT EXISTS payments_local (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount_poisha INTEGER NOT NULL,
  reference TEXT,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_local_sale ON payments_local (sale_id);

CREATE TABLE IF NOT EXISTS sale_returns_local (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  return_number TEXT NOT NULL,
  refund_method TEXT NOT NULL,
  subtotal_poisha INTEGER NOT NULL,
  discount_adjustment_poisha INTEGER NOT NULL DEFAULT 0,
  refund_total_poisha INTEGER NOT NULL,
  cash_refund_poisha INTEGER NOT NULL DEFAULT 0,
  credit_adjusted_poisha INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  actor_user_id TEXT,
  actor_name TEXT,
  returned_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_local_sale ON sale_returns_local (sale_id);

CREATE TABLE IF NOT EXISTS sale_return_items_local (
  id TEXT PRIMARY KEY,
  sale_return_id TEXT NOT NULL,
  sale_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name_bn TEXT NOT NULL,
  product_name_en TEXT,
  unit_name_bn TEXT NOT NULL,
  unit_name_en TEXT NOT NULL,
  qty_display TEXT NOT NULL,
  qty_base TEXT NOT NULL,
  unit_selling_price_poisha INTEGER NOT NULL,
  line_refund_poisha INTEGER NOT NULL,
  restored_cogs_poisha INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sale_return_items_local_ret ON sale_return_items_local (sale_return_id);
`;
