import {
  SyncOutboxStatuses,
  type LocalSyncCountsDto,
  type LocalSyncOutboxItemDto,
  type SyncEntityType,
  type SyncOperationType,
  type SyncOutboxStatus,
  type SyncPushConflictKind,
  type SyncPushOpInput,
  type SyncPushOpResultDto,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import { getLocalDatabase, type SqliteDatabaseAdapter } from '../sqlite';

interface SyncOutboxRow {
  client_op_id: string;
  shop_id: string;
  idempotency_key: string;
  op_type: string;
  entity_type: string;
  entity_id: string;
  depends_on_entity_id: string | null;
  sequence_no: number;
  base_version: number | null;
  payload_json: string;
  local_snapshot_json: string | null;
  status: string;
  retry_count: number;
  next_retry_at_ms: number;
  conflict_kind: string | null;
  conflict_message: string | null;
  server_version: number | null;
  server_snapshot_json: string | null;
  warnings_json: string | null;
  occurred_at: string;
  created_at_ms: number;
  updated_at_ms: number;
}

interface SyncStateRow {
  shop_id: string;
  last_sync_seq: number;
  last_synced_at: string | null;
  device_id: string;
}

interface SyncEntityFlagRow {
  pending_count: number;
  has_conflict: number;
}

export interface LocalSyncOutboxRecord extends LocalSyncOutboxItemDto {
  idempotencyKey: string;
  payload: Record<string, unknown>;
  localSnapshot: Record<string, unknown> | null;
  dependsOnEntityId: string | null;
  nextRetryAtMs: number;
}

export interface LocalSyncState {
  shopId: string;
  lastSyncSeq: number;
  lastSyncedAt: string | null;
  deviceId: string;
}

const BACKOFF_SCHEDULE_MS = [2_000, 5_000, 15_000, 60_000, 300_000] as const;

export function calculateBackoffDelayMs(retryCount: number, jitterFactor?: number): number {
  const idx = Math.min(Math.max(0, retryCount - 1), BACKOFF_SCHEDULE_MS.length - 1);
  const baseDelay = BACKOFF_SCHEDULE_MS[idx] ?? 300_000;
  // +/-20% jitter
  const factor = jitterFactor ?? 0.8 + Math.random() * 0.4;
  return Math.round(baseDelay * factor);
}

function safeParseObject(jsonStr: string | null): Record<string, unknown> | null {
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function safeParseStringArray(jsonStr: string | null): string[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function hydrateOutboxRecord(row: SyncOutboxRow): LocalSyncOutboxRecord {
  return {
    clientOpId: row.client_op_id,
    idempotencyKey: row.idempotency_key,
    shopId: row.shop_id,
    opType: row.op_type as SyncOperationType,
    entityType: row.entity_type as SyncEntityType,
    entityId: row.entity_id,
    dependsOnEntityId: row.depends_on_entity_id,
    sequenceNo: Number(row.sequence_no),
    baseVersion: row.base_version,
    status: row.status as SyncOutboxStatus,
    retryCount: Number(row.retry_count),
    nextRetryAtMs: Number(row.next_retry_at_ms),
    conflictKind: (row.conflict_kind as SyncPushConflictKind | null) ?? null,
    conflictMessage: row.conflict_message,
    serverVersion: row.server_version,
    payload: safeParseObject(row.payload_json) ?? {},
    localSnapshot: safeParseObject(row.local_snapshot_json),
    serverSnapshot: safeParseObject(row.server_snapshot_json),
    warnings: safeParseStringArray(row.warnings_json),
    occurredAt: row.occurred_at,
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

export async function refreshSyncEntityFlagTx(
  db: SqliteDatabaseAdapter,
  shopId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  const rows = await db.getAllAsync<{ status: string }>(
    `SELECT status FROM sync_outbox
     WHERE shop_id = ? AND entity_type = ? AND entity_id = ?`,
    shopId,
    entityType,
    entityId,
  );

  let pendingCount = 0;
  let hasConflict = 0;
  for (const row of rows) {
    if (
      row.status === SyncOutboxStatuses.PENDING ||
      row.status === SyncOutboxStatuses.IN_FLIGHT ||
      row.status === SyncOutboxStatuses.FAILED_RETRYABLE
    ) {
      pendingCount += 1;
    } else if (
      row.status === SyncOutboxStatuses.CONFLICT ||
      row.status === SyncOutboxStatuses.ACTION_REQUIRED
    ) {
      hasConflict = 1;
    }
  }

  if (pendingCount === 0 && hasConflict === 0) {
    await db.runAsync(
      `DELETE FROM sync_entity_flags WHERE shop_id = ? AND entity_type = ? AND entity_id = ?`,
      shopId,
      entityType,
      entityId,
    );
    return;
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_entity_flags (
      shop_id, entity_type, entity_id, pending_count, has_conflict, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    shopId,
    entityType,
    entityId,
    pendingCount,
    hasConflict,
    Date.now(),
  );
}

export async function enqueueSyncOperationTx(
  db: SqliteDatabaseAdapter,
  params: {
    clientOpId?: string;
    idempotencyKey?: string;
    shopId: string;
    opType: SyncOperationType;
    entityType: SyncEntityType;
    entityId: string;
    dependsOnEntityId?: string | null;
    baseVersion?: number | null;
    payload: Record<string, unknown>;
    localSnapshot?: Record<string, unknown> | null;
    occurredAt?: string;
  },
): Promise<LocalSyncOutboxRecord> {
  const maxRow = await db.getFirstAsync<{ max_seq: number | null }>(
    `SELECT COALESCE(MAX(sequence_no), 0) AS max_seq FROM sync_outbox`,
  );
  const nextSeq = (maxRow?.max_seq ?? 0) + 1;
  const nowMs = Date.now();
  const clientOpId = params.clientOpId ?? Crypto.randomUUID();
  const idempotencyKey = params.idempotencyKey ?? clientOpId;
  const occurredAt = params.occurredAt ?? new Date(nowMs).toISOString();

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_outbox (
      client_op_id, shop_id, idempotency_key, op_type, entity_type, entity_id,
      depends_on_entity_id, sequence_no, base_version, payload_json, local_snapshot_json,
      status, retry_count, next_retry_at_ms, conflict_kind, conflict_message,
      server_version, server_snapshot_json, warnings_json, occurred_at, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    clientOpId,
    params.shopId,
    idempotencyKey,
    params.opType,
    params.entityType,
    params.entityId,
    params.dependsOnEntityId ?? null,
    nextSeq,
    params.baseVersion ?? null,
    JSON.stringify(params.payload),
    params.localSnapshot ? JSON.stringify(params.localSnapshot) : null,
    SyncOutboxStatuses.PENDING,
    0,
    0,
    null,
    null,
    null,
    null,
    null,
    occurredAt,
    nowMs,
    nowMs,
  );

  await refreshSyncEntityFlagTx(db, params.shopId, params.entityType, params.entityId);

  return {
    clientOpId,
    idempotencyKey,
    shopId: params.shopId,
    opType: params.opType,
    entityType: params.entityType,
    entityId: params.entityId,
    dependsOnEntityId: params.dependsOnEntityId ?? null,
    sequenceNo: nextSeq,
    baseVersion: params.baseVersion ?? null,
    payload: params.payload,
    localSnapshot: params.localSnapshot ?? null,
    status: SyncOutboxStatuses.PENDING,
    retryCount: 0,
    nextRetryAtMs: 0,
    conflictKind: null,
    conflictMessage: null,
    serverVersion: null,
    serverSnapshot: null,
    warnings: [],
    occurredAt,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export async function recoverInFlightSyncOpsOnStartup(): Promise<number> {
  const db = await getLocalDatabase();
  const inFlight = await db.getAllAsync<{ client_op_id: string }>(
    `SELECT client_op_id FROM sync_outbox WHERE status = 'IN_FLIGHT'`,
  );
  if (inFlight.length === 0) {
    return 0;
  }
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'PENDING', next_retry_at_ms = 0, updated_at_ms = ?
     WHERE status = 'IN_FLIGHT'`,
    Date.now(),
  );
  return inFlight.length;
}

export async function loadSyncOutboxItems(shopId: string): Promise<LocalSyncOutboxRecord[]> {
  if (!shopId) return [];
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<SyncOutboxRow>(
    `SELECT * FROM sync_outbox WHERE shop_id = ? ORDER BY sequence_no ASC`,
    shopId,
  );
  return rows.map(hydrateOutboxRecord);
}

export async function getSyncCounts(shopId: string): Promise<LocalSyncCountsDto> {
  const items = await loadSyncOutboxItems(shopId);
  let pendingCount = 0;
  let inFlightCount = 0;
  let retryableCount = 0;
  let conflictCount = 0;
  let actionRequiredCount = 0;

  for (const item of items) {
    switch (item.status) {
      case SyncOutboxStatuses.PENDING:
        pendingCount += 1;
        break;
      case SyncOutboxStatuses.IN_FLIGHT:
        inFlightCount += 1;
        break;
      case SyncOutboxStatuses.FAILED_RETRYABLE:
        retryableCount += 1;
        break;
      case SyncOutboxStatuses.CONFLICT:
        conflictCount += 1;
        break;
      case SyncOutboxStatuses.ACTION_REQUIRED:
        actionRequiredCount += 1;
        break;
      default:
        break;
    }
  }

  return {
    pendingCount,
    inFlightCount,
    retryableCount,
    conflictCount,
    actionRequiredCount,
    totalUnresolvedCount:
      pendingCount + inFlightCount + retryableCount + conflictCount + actionRequiredCount,
  };
}

export async function getRunnableOutboxOps(
  shopId: string,
  nowMs = Date.now(),
  limit = 50,
): Promise<LocalSyncOutboxRecord[]> {
  const all = await loadSyncOutboxItems(shopId);
  const blockedEntities = new Set<string>();
  const runnable: LocalSyncOutboxRecord[] = [];

  for (const op of all) {
    const isUnfinished = op.status !== SyncOutboxStatuses.SYNCED;
    const isCausalBlocked =
      Boolean(op.dependsOnEntityId) && blockedEntities.has(op.dependsOnEntityId ?? '');

    if (
      !isCausalBlocked &&
      (op.status === SyncOutboxStatuses.PENDING ||
        (op.status === SyncOutboxStatuses.FAILED_RETRYABLE && op.nextRetryAtMs <= nowMs))
    ) {
      if (runnable.length < limit) {
        runnable.push(op);
      }
    }

    if (isUnfinished) {
      blockedEntities.add(op.entityId);
    }
  }

  return runnable;
}

export function toSyncPushOpInput(record: LocalSyncOutboxRecord): SyncPushOpInput {
  return {
    clientOpId: record.clientOpId,
    idempotencyKey: record.idempotencyKey,
    opType: record.opType,
    entityType: record.entityType,
    entityId: record.entityId,
    dependsOnEntityId: record.dependsOnEntityId,
    baseVersion: record.baseVersion,
    occurredAt: record.occurredAt,
    payload: record.payload,
  };
}

export async function markOutboxOpsInFlight(
  shopId: string,
  clientOpIds: readonly string[],
): Promise<void> {
  if (clientOpIds.length === 0) return;
  const db = await getLocalDatabase();
  const nowMs = Date.now();
  await db.withTransactionAsync(async () => {
    for (const clientOpId of clientOpIds) {
      await db.runAsync(
        `UPDATE sync_outbox SET status = 'IN_FLIGHT', updated_at_ms = ? WHERE shop_id = ? AND client_op_id = ?`,
        nowMs,
        shopId,
        clientOpId,
      );
    }
  });
}

export async function markOutboxOpSynced(
  shopId: string,
  clientOpId: string,
  warnings: readonly string[] = [],
): Promise<void> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<SyncOutboxRow>(
    `SELECT * FROM sync_outbox WHERE shop_id = ? AND client_op_id = ?`,
    shopId,
    clientOpId,
  );
  if (!row) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE sync_outbox
       SET status = 'SYNCED',
           conflict_kind = NULL,
           conflict_message = NULL,
           server_version = NULL,
           server_snapshot_json = NULL,
           warnings_json = ?,
           updated_at_ms = ?
       WHERE shop_id = ? AND client_op_id = ?`,
      warnings.length > 0 ? JSON.stringify(warnings) : null,
      Date.now(),
      shopId,
      clientOpId,
    );
    await refreshSyncEntityFlagTx(db, shopId, row.entity_type, row.entity_id);
  });
}

export async function markOutboxOpRetryable(
  shopId: string,
  clientOpId: string,
  errorMessage: string,
  nowMs = Date.now(),
): Promise<void> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<SyncOutboxRow>(
    `SELECT * FROM sync_outbox WHERE shop_id = ? AND client_op_id = ?`,
    shopId,
    clientOpId,
  );
  if (!row) return;

  const nextRetryCount = Number(row.retry_count) + 1;
  const nextRetryAtMs = nowMs + calculateBackoffDelayMs(nextRetryCount);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE sync_outbox
       SET status = 'FAILED_RETRYABLE',
           retry_count = ?,
           next_retry_at_ms = ?,
           conflict_message = ?,
           updated_at_ms = ?
       WHERE shop_id = ? AND client_op_id = ?`,
      nextRetryCount,
      nextRetryAtMs,
      errorMessage,
      nowMs,
      shopId,
      clientOpId,
    );
    await refreshSyncEntityFlagTx(db, shopId, row.entity_type, row.entity_id);
  });
}

export async function markOutboxOpConflictResult(
  shopId: string,
  result: SyncPushOpResultDto,
): Promise<void> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<SyncOutboxRow>(
    `SELECT * FROM sync_outbox WHERE shop_id = ? AND client_op_id = ?`,
    shopId,
    result.clientOpId,
  );
  if (!row) return;

  const nextStatus =
    result.status === 'CONFLICT'
      ? SyncOutboxStatuses.CONFLICT
      : SyncOutboxStatuses.ACTION_REQUIRED;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE sync_outbox
       SET status = ?,
           conflict_kind = ?,
           conflict_message = ?,
           server_version = ?,
           server_snapshot_json = ?,
           updated_at_ms = ?
       WHERE shop_id = ? AND client_op_id = ?`,
      nextStatus,
      result.conflictKind ?? null,
      result.conflictMessage ?? null,
      result.serverVersion ?? null,
      result.serverSnapshot ? JSON.stringify(result.serverSnapshot) : null,
      Date.now(),
      shopId,
      result.clientOpId,
    );
    await refreshSyncEntityFlagTx(db, shopId, row.entity_type, row.entity_id);
  });
}

export async function resetRetryBackoffOnReconnect(shopId: string): Promise<void> {
  if (!shopId) return;
  const db = await getLocalDatabase();
  await db.runAsync(
    `UPDATE sync_outbox
     SET next_retry_at_ms = 0, updated_at_ms = ?
     WHERE shop_id = ? AND status = 'FAILED_RETRYABLE'`,
    Date.now(),
    shopId,
  );
}

export async function requeueOutboxOpForRetry(
  shopId: string,
  clientOpId: string,
  options?: {
    overrideVersion?: number | null;
    forceAllowNegativeStock?: boolean;
  },
): Promise<void> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<SyncOutboxRow>(
    `SELECT * FROM sync_outbox WHERE shop_id = ? AND client_op_id = ?`,
    shopId,
    clientOpId,
  );
  if (!row) return;

  const currentPayload = safeParseObject(row.payload_json) ?? {};
  const nextPayload: Record<string, unknown> = {
    ...currentPayload,
    ...(options?.overrideVersion !== undefined && options.overrideVersion !== null
      ? { expectedVersion: options.overrideVersion }
      : {}),
    ...(options?.forceAllowNegativeStock ? { forceAllowNegativeStock: true } : {}),
  };

  const nextBaseVersion =
    options?.overrideVersion !== undefined ? options.overrideVersion : row.base_version;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE sync_outbox
       SET idempotency_key = ?,
           base_version = ?,
           payload_json = ?,
           status = 'PENDING',
           retry_count = 0,
           next_retry_at_ms = 0,
           conflict_kind = NULL,
           conflict_message = NULL,
           server_version = NULL,
           server_snapshot_json = NULL,
           updated_at_ms = ?
       WHERE shop_id = ? AND client_op_id = ?`,
      Crypto.randomUUID(),
      nextBaseVersion,
      JSON.stringify(nextPayload),
      Date.now(),
      shopId,
      clientOpId,
    );
    await refreshSyncEntityFlagTx(db, shopId, row.entity_type, row.entity_id);
  });
}

export async function discardOutboxOp(shopId: string, clientOpId: string): Promise<void> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<SyncOutboxRow>(
    `SELECT * FROM sync_outbox WHERE shop_id = ? AND client_op_id = ?`,
    shopId,
    clientOpId,
  );
  if (!row) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM sync_outbox WHERE shop_id = ? AND client_op_id = ?`,
      shopId,
      clientOpId,
    );
    await refreshSyncEntityFlagTx(db, shopId, row.entity_type, row.entity_id);
  });
}

export async function isEntityProtectedFromPull(
  shopId: string,
  entityType: SyncEntityType | string,
  entityId: string,
): Promise<boolean> {
  if (!shopId || !entityId) return false;
  const db = await getLocalDatabase();
  const flag = await db.getFirstAsync<SyncEntityFlagRow>(
    `SELECT pending_count, has_conflict FROM sync_entity_flags
     WHERE shop_id = ? AND entity_type = ? AND entity_id = ?`,
    shopId,
    entityType,
    entityId,
  );
  if (!flag) return false;
  return flag.pending_count > 0 || flag.has_conflict === 1;
}

export async function getOrCreateLocalSyncState(shopId: string): Promise<LocalSyncState> {
  const db = await getLocalDatabase();
  const existing = await db.getFirstAsync<SyncStateRow>(
    `SELECT * FROM sync_state WHERE shop_id = ?`,
    shopId,
  );
  if (existing) {
    return {
      shopId: existing.shop_id,
      lastSyncSeq: Number(existing.last_sync_seq),
      lastSyncedAt: existing.last_synced_at,
      deviceId: existing.device_id,
    };
  }
  const deviceId = Crypto.randomUUID();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_state (shop_id, last_sync_seq, last_synced_at, device_id)
     VALUES (?, ?, ?, ?)`,
    shopId,
    0,
    null,
    deviceId,
  );
  return {
    shopId,
    lastSyncSeq: 0,
    lastSyncedAt: null,
    deviceId,
  };
}

export async function updateLocalSyncCursor(
  shopId: string,
  lastSyncSeq: number,
  lastSyncedAt: string,
): Promise<void> {
  const db = await getLocalDatabase();
  const current = await getOrCreateLocalSyncState(shopId);
  const effectiveSeq = Math.max(current.lastSyncSeq, lastSyncSeq);
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_state (shop_id, last_sync_seq, last_synced_at, device_id)
     VALUES (?, ?, ?, ?)`,
    shopId,
    effectiveSeq,
    lastSyncedAt,
    current.deviceId,
  );
}

export async function clearLocalSyncData(): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sync_outbox');
    await db.runAsync('DELETE FROM sync_state');
    await db.runAsync('DELETE FROM sync_entity_flags');
  });
}
