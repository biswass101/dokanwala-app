export const MIGRATION_004_PURCHASES_SUPPLIERS = `
CREATE TABLE IF NOT EXISTS suppliers_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT,
  phone TEXT,
  address TEXT,
  note TEXT,
  total_purchased_poisha INTEGER NOT NULL DEFAULT 0,
  total_paid_poisha INTEGER NOT NULL DEFAULT 0,
  payable_poisha INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppliers_local_shop ON suppliers_local (shop_id, is_active, payable_poisha);

CREATE TABLE IF NOT EXISTS purchases_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  purchase_number TEXT NOT NULL,
  supplier_id TEXT,
  supplier_name_snapshot TEXT,
  status TEXT NOT NULL,
  subtotal_poisha INTEGER NOT NULL,
  discount_poisha INTEGER NOT NULL DEFAULT 0,
  total_poisha INTEGER NOT NULL,
  paid_poisha INTEGER NOT NULL DEFAULT 0,
  settled_due_poisha INTEGER NOT NULL DEFAULT 0,
  due_poisha INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_reference TEXT,
  returned_total_poisha INTEGER NOT NULL DEFAULT 0,
  cash_refunded_poisha INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  actor_user_id TEXT,
  actor_name TEXT,
  purchased_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchases_local_shop_date ON purchases_local (shop_id, purchased_at DESC);

CREATE TABLE IF NOT EXISTS purchase_items_local (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  product_name_bn TEXT NOT NULL,
  product_name_en TEXT,
  unit_name_bn TEXT NOT NULL,
  unit_name_en TEXT NOT NULL,
  line_order INTEGER NOT NULL DEFAULT 0,
  qty_display TEXT NOT NULL,
  conversion_factor_to_base TEXT NOT NULL,
  qty_base TEXT NOT NULL,
  returned_qty_base TEXT NOT NULL DEFAULT '0.0000',
  unit_cost_poisha INTEGER NOT NULL,
  line_total_poisha INTEGER NOT NULL,
  net_cost_poisha INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_local_purchase ON purchase_items_local (purchase_id, line_order);

CREATE TABLE IF NOT EXISTS purchase_returns_local (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  return_number TEXT NOT NULL,
  refund_method TEXT NOT NULL,
  subtotal_poisha INTEGER NOT NULL,
  discount_adjustment_poisha INTEGER NOT NULL DEFAULT 0,
  refund_total_poisha INTEGER NOT NULL,
  cash_refund_poisha INTEGER NOT NULL DEFAULT 0,
  payable_adjusted_poisha INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  actor_user_id TEXT,
  actor_name TEXT,
  returned_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_local_purchase ON purchase_returns_local (purchase_id);

CREATE TABLE IF NOT EXISTS purchase_return_items_local (
  id TEXT PRIMARY KEY,
  purchase_return_id TEXT NOT NULL,
  purchase_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name_bn TEXT NOT NULL,
  product_name_en TEXT,
  unit_name_bn TEXT NOT NULL,
  unit_name_en TEXT NOT NULL,
  qty_display TEXT NOT NULL,
  qty_base TEXT NOT NULL,
  unit_cost_poisha INTEGER NOT NULL,
  line_refund_poisha INTEGER NOT NULL,
  reversed_cost_poisha INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_local_ret ON purchase_return_items_local (purchase_return_id);

CREATE TABLE IF NOT EXISTS supplier_ledger_entries_local (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reference_number TEXT,
  occurred_at TEXT NOT NULL,
  total_poisha INTEGER NOT NULL,
  paid_or_refunded_poisha INTEGER NOT NULL,
  payable_delta_poisha INTEGER NOT NULL,
  running_payable_poisha INTEGER NOT NULL,
  method TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_entries_local_sup ON supplier_ledger_entries_local (supplier_id, occurred_at ASC);
`;
