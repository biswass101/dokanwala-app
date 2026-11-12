export const MIGRATION_005_CUSTOMERS_EXPENSES = `
ALTER TABLE sales_local ADD COLUMN settled_due_poisha INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS customer_ledger_entries_local (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reference_number TEXT,
  occurred_at TEXT NOT NULL,
  total_poisha INTEGER NOT NULL,
  paid_or_refunded_poisha INTEGER NOT NULL,
  due_delta_poisha INTEGER NOT NULL,
  running_due_poisha INTEGER NOT NULL,
  method TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_entries_local_cust ON customer_ledger_entries_local (customer_id, occurred_at ASC);

CREATE TABLE IF NOT EXISTS expense_categories_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_local_shop ON expense_categories_local (shop_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS expenses_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name_bn TEXT NOT NULL,
  category_name_en TEXT,
  amount_poisha INTEGER NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  note TEXT,
  incurred_at TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_local_shop_date ON expenses_local (shop_id, incurred_at DESC);

CREATE TABLE IF NOT EXISTS expense_audit_logs_local (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  expense_id TEXT NOT NULL,
  action TEXT NOT NULL,
  edited_by_id TEXT,
  edited_by_name TEXT,
  before_json TEXT,
  after_json TEXT NOT NULL,
  reason TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expense_audit_logs_local_exp ON expense_audit_logs_local (expense_id, occurred_at DESC);
`;
