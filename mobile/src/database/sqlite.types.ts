import type { SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

export type SqliteBindValue = SQLiteBindValue;
export type SqliteRunResult = SQLiteRunResult;

export interface SqliteDatabaseAdapter {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SQLiteBindValue[]): Promise<SQLiteRunResult>;
  getFirstAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
