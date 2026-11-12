export const MIGRATION_006_CASHBOOK_REPORTS = `
CREATE TABLE IF NOT EXISTS cashbook_daily_cache (
  shop_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, business_date)
);

CREATE TABLE IF NOT EXISTS reports_snapshot_cache (
  shop_id TEXT NOT NULL,
  report_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, report_key)
);
`;
