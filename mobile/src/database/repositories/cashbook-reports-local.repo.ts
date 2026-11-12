import type { CashbookSummaryResponse } from '@dokanwala/shared';
import { getLocalDatabase } from '../sqlite';

interface CashbookDailyCacheRow {
  summary_json: string;
}

interface ReportSnapshotCacheRow {
  payload_json: string;
}

export async function saveLocalCashbookSummary(
  shopId: string,
  businessDate: string,
  summary: CashbookSummaryResponse,
): Promise<void> {
  if (!shopId) return;
  const db = await getLocalDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO cashbook_daily_cache (shop_id, business_date, summary_json, cached_at)
     VALUES (?, ?, ?, ?)`,
    shopId,
    businessDate,
    JSON.stringify(summary),
    new Date().toISOString(),
  );
}

export async function loadLocalCashbookSummary(
  shopId: string,
  businessDate: string,
): Promise<CashbookSummaryResponse | null> {
  if (!shopId) return null;
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<CashbookDailyCacheRow>(
    `SELECT summary_json FROM cashbook_daily_cache WHERE shop_id = ? AND business_date = ?`,
    shopId,
    businessDate,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.summary_json) as CashbookSummaryResponse;
  } catch {
    return null;
  }
}

export async function saveLocalReportSnapshot<T>(
  shopId: string,
  reportKey: string,
  payload: T,
): Promise<void> {
  if (!shopId) return;
  const db = await getLocalDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO reports_snapshot_cache (shop_id, report_key, payload_json, cached_at)
     VALUES (?, ?, ?, ?)`,
    shopId,
    reportKey,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

export async function loadLocalReportSnapshot<T>(
  shopId: string,
  reportKey: string,
): Promise<T | null> {
  if (!shopId) return null;
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<ReportSnapshotCacheRow>(
    `SELECT payload_json FROM reports_snapshot_cache WHERE shop_id = ? AND report_key = ?`,
    shopId,
    reportKey,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

export async function clearLocalCashbookReportsData(): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cashbook_daily_cache');
    await db.runAsync('DELETE FROM reports_snapshot_cache');
  });
}
