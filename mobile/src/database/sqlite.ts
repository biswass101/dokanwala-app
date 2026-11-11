import { MIGRATION_001_AUTH_SHOP } from './migrations/001_initial_auth_shop';
import { openPlatformSqliteDatabase } from './sqlite-driver';
import type { SqliteDatabaseAdapter } from './sqlite.types';

export type { SqliteBindValue, SqliteDatabaseAdapter, SqliteRunResult } from './sqlite.types';

interface MigrationDefinition {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: readonly MigrationDefinition[] = [
  {
    version: 1,
    name: '001_initial_auth_shop',
    sql: MIGRATION_001_AUTH_SHOP,
  },
];

let dbInstance: SqliteDatabaseAdapter | null = null;
let initPromise: Promise<SqliteDatabaseAdapter> | null = null;

async function runMigrations(db: SqliteDatabaseAdapter): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at_ms INTEGER NOT NULL
    );
  `);

  const appliedRows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const appliedVersions = new Set(appliedRows.map((row) => row.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, name, applied_at_ms) VALUES (?, ?, ?)',
        migration.version,
        migration.name,
        Date.now(),
      );
    });
  }
}

export async function getLocalDatabase(): Promise<SqliteDatabaseAdapter> {
  if (dbInstance) {
    return dbInstance;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = await openPlatformSqliteDatabase();
    await runMigrations(db);
    dbInstance = db;
    return db;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

export function resetLocalDatabaseInstanceForTests(adapter: SqliteDatabaseAdapter | null): void {
  dbInstance = adapter;
  initPromise = null;
}
