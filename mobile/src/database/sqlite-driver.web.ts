import type { SqliteBindValue, SqliteDatabaseAdapter } from './sqlite.types';

function createInMemoryWebFallback(): SqliteDatabaseAdapter {
  const store = new Map<string, string>();
  const shops = new Map<string, Record<string, unknown>>();
  const users = new Map<string, Record<string, unknown>>();

  return {
    async execAsync() {
      // No-op in web preview fallback
    },
    async runAsync(source: string, ...params: SqliteBindValue[]) {
      const normalized = source.trim().toUpperCase();
      if (normalized.includes('INTO APP_PREFERENCES')) {
        const key = String(params[0] ?? '');
        const value = String(params[1] ?? '');
        store.set(key, value);
      } else if (normalized.includes('INTO SHOPS_LOCAL')) {
        shops.set(String(params[0] ?? ''), {
          id: params[0],
          name_bn: params[1],
          name_en: params[2],
          address_bn: params[3],
          address_en: params[4],
          phone: params[5],
          logo_url: params[6],
          currency_code: params[7],
          timezone: params[8],
          default_language: params[9],
          default_digit_style: params[10],
          receipt_header_bn: params[11],
          receipt_footer_bn: params[12],
          allow_negative_stock: params[13],
          employee_can_give_credit: params[14],
          employee_max_discount_percent: params[15],
          is_active: params[16],
          created_at: params[17],
          updated_at: params[18],
        });
      } else if (normalized.includes('INTO USERS_LOCAL')) {
        users.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          name: params[2],
          phone: params[3],
          role: params[4],
          has_pin: params[5],
          preferred_language: params[6],
          preferred_digit_style: params[7],
          is_active: params[8],
          created_at: params[9],
        });
      } else if (normalized.startsWith('DELETE FROM SHOPS_LOCAL')) {
        shops.clear();
      } else if (normalized.startsWith('DELETE FROM USERS_LOCAL')) {
        users.clear();
      }
      return { changes: 1, lastInsertRowId: 1 };
    },
    async getFirstAsync<T>(source: string, ...params: SqliteBindValue[]): Promise<T | null> {
      const normalized = source.trim().toUpperCase();
      if (normalized.includes('FROM APP_PREFERENCES')) {
        const val = store.get(String(params[0] ?? ''));
        return val !== undefined ? ({ value: val } as T) : null;
      }
      if (normalized.includes('FROM SHOPS_LOCAL')) {
        const first = shops.values().next().value;
        return (first as T | undefined) ?? null;
      }
      if (normalized.includes('FROM USERS_LOCAL')) {
        const first = users.values().next().value;
        return (first as T | undefined) ?? null;
      }
      return null;
    },
    async getAllAsync<T>() {
      return [] as T[];
    },
    async withTransactionAsync(task: () => Promise<void>) {
      await task();
    },
  };
}

export async function openPlatformSqliteDatabase(): Promise<SqliteDatabaseAdapter> {
  // Minimal web preview fallback; native iOS/Android execute real Expo SQLite via sqlite-driver.ts
  return createInMemoryWebFallback();
}
