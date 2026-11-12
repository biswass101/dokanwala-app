import type { ShopProfileDto } from './auth.js';

export const SyncOperationTypes = {
  CREATE_PRODUCT: 'CREATE_PRODUCT',
  UPDATE_PRODUCT: 'UPDATE_PRODUCT',
  ARCHIVE_PRODUCT: 'ARCHIVE_PRODUCT',
  CREATE_STOCK_ADJUSTMENT: 'CREATE_STOCK_ADJUSTMENT',
  CREATE_CUSTOMER: 'CREATE_CUSTOMER',
  UPDATE_CUSTOMER: 'UPDATE_CUSTOMER',
  CREATE_SALE: 'CREATE_SALE',
  CREATE_SALE_RETURN: 'CREATE_SALE_RETURN',
  CANCEL_SALE: 'CANCEL_SALE',
  COLLECT_CUSTOMER_PAYMENT: 'COLLECT_CUSTOMER_PAYMENT',
  CREATE_EXPENSE_CATEGORY: 'CREATE_EXPENSE_CATEGORY',
  CREATE_EXPENSE: 'CREATE_EXPENSE',
  UPDATE_EXPENSE: 'UPDATE_EXPENSE',
  CREATE_SUPPLIER: 'CREATE_SUPPLIER',
  UPDATE_SUPPLIER: 'UPDATE_SUPPLIER',
  CREATE_PURCHASE: 'CREATE_PURCHASE',
  CREATE_PURCHASE_RETURN: 'CREATE_PURCHASE_RETURN',
  CREATE_SUPPLIER_PAYMENT: 'CREATE_SUPPLIER_PAYMENT',
  OPEN_CASHBOOK: 'OPEN_CASHBOOK',
  CLOSE_CASHBOOK: 'CLOSE_CASHBOOK',
  CREATE_MANUAL_CASHBOOK_ENTRY: 'CREATE_MANUAL_CASHBOOK_ENTRY',
} as const;

export type SyncOperationType =
  (typeof SyncOperationTypes)[keyof typeof SyncOperationTypes];

export const SyncEntityTypes = {
  CATEGORY: 'CATEGORY',
  UNIT: 'UNIT',
  PRODUCT: 'PRODUCT',
  STOCK_ADJUSTMENT: 'STOCK_ADJUSTMENT',
  CUSTOMER: 'CUSTOMER',
  SALE: 'SALE',
  SALE_RETURN: 'SALE_RETURN',
  CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
  SUPPLIER: 'SUPPLIER',
  PURCHASE: 'PURCHASE',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT',
  EXPENSE_CATEGORY: 'EXPENSE_CATEGORY',
  EXPENSE: 'EXPENSE',
  CASHBOOK_SESSION: 'CASHBOOK_SESSION',
  CASHBOOK_ENTRY: 'CASHBOOK_ENTRY',
} as const;

export type SyncEntityType = (typeof SyncEntityTypes)[keyof typeof SyncEntityTypes];

export const SyncOutboxStatuses = {
  PENDING: 'PENDING',
  IN_FLIGHT: 'IN_FLIGHT',
  SYNCED: 'SYNCED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  CONFLICT: 'CONFLICT',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
} as const;

export type SyncOutboxStatus =
  (typeof SyncOutboxStatuses)[keyof typeof SyncOutboxStatuses];

export type SyncPushResultStatus = 'SYNCED' | 'CONFLICT' | 'ACTION_REQUIRED';

export type SyncPushConflictKind =
  | 'VERSION_CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'VALIDATION_ERROR';

export interface SyncPushOpInput {
  clientOpId: string;
  idempotencyKey: string;
  opType: SyncOperationType;
  entityType: SyncEntityType;
  entityId: string;
  dependsOnEntityId?: string | null;
  baseVersion?: number | null;
  occurredAt?: string | null;
  payload: Record<string, unknown>;
}

export interface SyncPushRequest {
  deviceId?: string | null;
  operations: SyncPushOpInput[];
}

export interface SyncPushOpResultDto {
  clientOpId: string;
  idempotencyKey: string;
  opType: SyncOperationType;
  entityType: SyncEntityType;
  entityId: string;
  status: SyncPushResultStatus;
  syncSeq: number | null;
  replayed: boolean;
  conflictKind?: SyncPushConflictKind;
  conflictMessage?: string;
  serverVersion?: number | null;
  serverSnapshot?: Record<string, unknown> | null;
  appliedEntity?: Record<string, unknown> | null;
  warnings?: string[];
}

export interface SyncPushResponse {
  results: SyncPushOpResultDto[];
  latestSyncSeq: number;
}

export interface SyncPullChangeDto {
  syncSeq: number;
  entityType: SyncEntityType;
  entityId: string;
  action: 'UPSERT' | 'DELETE';
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

export interface SyncPullResponse {
  cursor: number;
  nextCursor: number;
  hasMore: boolean;
  serverTime: string;
  shop: ShopProfileDto | null;
  changes: SyncPullChangeDto[];
}

export interface LocalSyncOutboxItemDto {
  sequenceNo: number;
  clientOpId: string;
  idempotencyKey: string;
  shopId: string;
  opType: SyncOperationType;
  entityType: SyncEntityType;
  entityId: string;
  dependsOnEntityId: string | null;
  baseVersion: number | null;
  payload: Record<string, unknown>;
  status: SyncOutboxStatus;
  retryCount: number;
  nextRetryAtMs: number;
  conflictKind: SyncPushConflictKind | null;
  conflictMessage: string | null;
  serverVersion: number | null;
  serverSnapshot: Record<string, unknown> | null;
  localSnapshot: Record<string, unknown> | null;
  warnings: string[];
  occurredAt: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface LocalSyncCountsDto {
  pendingCount: number;
  inFlightCount: number;
  retryableCount: number;
  conflictCount: number;
  actionRequiredCount: number;
  totalUnresolvedCount: number;
}
