import * as SQLite from 'expo-sqlite';
import type { SqliteDatabaseAdapter } from './sqlite.types';

export async function openPlatformSqliteDatabase(): Promise<SqliteDatabaseAdapter> {
  return SQLite.openDatabaseAsync('dokanwala.db');
}
