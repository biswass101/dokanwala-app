import {
  SyncEntityTypes,
  SyncOperationTypes,
  type CashbookSummaryResponse,
  type CategoryDto,
  type CustomerDto,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ProductDto,
  type PurchaseDto,
  type SaleDto,
  type SupplierDto,
  type SyncPullChangeDto,
  type SyncPushOpResultDto,
  type UnitDto,
} from '@dokanwala/shared';
import NetInfo from '@react-native-community/netinfo';
import type { QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import { saveLocalCashbookSummary } from '@/database/repositories/cashbook-reports-local.repo';
import {
  removeLocalCategory,
  removeLocalProduct,
  upsertLocalCategory,
  upsertLocalProduct,
  upsertLocalUnit,
} from '@/database/repositories/catalog-local.repo';
import {
  removeLocalExpenseCategory,
  upsertLocalExpense,
  upsertLocalExpenseCategory,
} from '@/database/repositories/customers-expenses-local.repo';
import { rollbackConflictedLocalSaleIfNeeded } from '@/database/repositories/offline-writes.repo';
import {
  removeLocalSupplier,
  upsertLocalPurchase,
  upsertLocalSupplier,
} from '@/database/repositories/purchases-local.repo';
import {
  removeLocalCustomer,
  upsertLocalCustomer,
  upsertLocalSale,
} from '@/database/repositories/sales-local.repo';
import {
  discardOutboxOp,
  getOrCreateLocalSyncState,
  getRunnableOutboxOps,
  isEntityProtectedFromPull,
  markOutboxOpConflictResult,
  markOutboxOpRetryable,
  markOutboxOpSynced,
  markOutboxOpsInFlight,
  requeueOutboxOpForRetry,
  resetRetryBackoffOnReconnect,
  toSyncPushOpInput,
  updateLocalSyncCursor,
  type LocalSyncOutboxRecord,
} from '@/database/repositories/sync-outbox.repo';
import { ApiClientError } from '@/services/api/client';
import { syncApi } from '@/services/api/sync';
import { useAuthStore } from '@/store/auth.store';
import { useSyncStore } from '@/store/sync.store';

export interface RunSyncResult {
  pushedCount: number;
  pulledCount: number;
  conflictCount: number;
}

const SYNC_INTERVAL_MS = 30_000;

let activeSyncPromise: Promise<RunSyncResult> | null = null;
let netInfoUnsubscribe: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let previousOnlineState: boolean | null = null;

async function applyEntitySnapshotToLocal(
  shopId: string,
  entityType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  switch (entityType) {
    case SyncEntityTypes.CATEGORY:
      await upsertLocalCategory(payload as unknown as CategoryDto);
      return;
    case SyncEntityTypes.UNIT:
      await upsertLocalUnit(payload as unknown as UnitDto);
      return;
    case SyncEntityTypes.PRODUCT:
      await upsertLocalProduct(payload as unknown as ProductDto);
      return;
    case SyncEntityTypes.CUSTOMER:
      await upsertLocalCustomer(payload as unknown as CustomerDto);
      return;
    case SyncEntityTypes.SALE:
      await upsertLocalSale(payload as unknown as SaleDto);
      return;
    case SyncEntityTypes.SUPPLIER:
      await upsertLocalSupplier(payload as unknown as SupplierDto);
      return;
    case SyncEntityTypes.PURCHASE:
      await upsertLocalPurchase(payload as unknown as PurchaseDto);
      return;
    case SyncEntityTypes.EXPENSE_CATEGORY:
      await upsertLocalExpenseCategory(payload as unknown as ExpenseCategoryDto);
      return;
    case SyncEntityTypes.EXPENSE:
      await upsertLocalExpense(payload as unknown as ExpenseDto);
      return;
    case SyncEntityTypes.CASHBOOK_SESSION:
    case SyncEntityTypes.CASHBOOK_ENTRY: {
      const summary = payload as unknown as CashbookSummaryResponse;
      if (summary.businessDate) {
        await saveLocalCashbookSummary(shopId, summary.businessDate, summary);
      }
      return;
    }
    default:
      return;
  }
}

async function applySyncedPushEntityIfSafe(
  shopId: string,
  result: SyncPushOpResultDto,
): Promise<void> {
  if (!result.appliedEntity) return;
  const entityId =
    typeof result.appliedEntity.id === 'string' ? result.appliedEntity.id : result.entityId;

  if (result.entityType === SyncEntityTypes.STOCK_ADJUSTMENT) {
    if (await isEntityProtectedFromPull(shopId, SyncEntityTypes.PRODUCT, entityId)) return;
    await upsertLocalProduct(result.appliedEntity as unknown as ProductDto);
    return;
  }

  if (await isEntityProtectedFromPull(shopId, result.entityType, entityId)) {
    return;
  }

  if (
    result.opType === SyncOperationTypes.OPEN_CASHBOOK ||
    result.opType === SyncOperationTypes.CLOSE_CASHBOOK
  ) {
    const summary = result.appliedEntity as unknown as CashbookSummaryResponse;
    if (summary.businessDate) {
      await saveLocalCashbookSummary(shopId, summary.businessDate, summary);
    }
    return;
  }

  if (result.opType === SyncOperationTypes.CREATE_MANUAL_CASHBOOK_ENTRY) {
    return;
  }

  await applyEntitySnapshotToLocal(shopId, result.entityType, result.appliedEntity);
}

async function applyPullChangeIfSafe(shopId: string, change: SyncPullChangeDto): Promise<boolean> {
  const isProtected = await isEntityProtectedFromPull(shopId, change.entityType, change.entityId);
  if (isProtected) {
    return false;
  }

  if (change.action === 'DELETE') {
    switch (change.entityType) {
      case SyncEntityTypes.CATEGORY:
        await removeLocalCategory(shopId, change.entityId);
        return true;
      case SyncEntityTypes.PRODUCT:
        await removeLocalProduct(change.entityId);
        return true;
      case SyncEntityTypes.CUSTOMER:
        await removeLocalCustomer(shopId, change.entityId);
        return true;
      case SyncEntityTypes.SUPPLIER:
        await removeLocalSupplier(shopId, change.entityId);
        return true;
      case SyncEntityTypes.EXPENSE_CATEGORY:
        await removeLocalExpenseCategory(shopId, change.entityId);
        return true;
      default:
        return false;
    }
  }

  if (!change.payload) {
    return false;
  }

  await applyEntitySnapshotToLocal(shopId, change.entityType, change.payload);
  return true;
}

async function invalidateSyncedQueries(queryClient?: QueryClient): Promise<void> {
  if (!queryClient) return;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['catalog'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    queryClient.invalidateQueries({ queryKey: ['sales'] }),
    queryClient.invalidateQueries({ queryKey: ['customers'] }),
    queryClient.invalidateQueries({ queryKey: ['purchases'] }),
    queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    queryClient.invalidateQueries({ queryKey: ['expenses'] }),
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] }),
    queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
    queryClient.invalidateQueries({ queryKey: ['reports'] }),
  ]);
}

export async function runSyncNow(
  queryClient?: QueryClient,
  options?: { force?: boolean },
): Promise<RunSyncResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async (): Promise<RunSyncResult> => {
    const authState = useAuthStore.getState();
    const shopId = authState.shop?.id;
    if (authState.status !== 'authenticated' || !shopId) {
      return { pushedCount: 0, pulledCount: 0, conflictCount: 0 };
    }

    const syncStore = useSyncStore.getState();
    if (!options?.force && !syncStore.isOnline) {
      await syncStore.refreshFromLocalDb(shopId);
      return { pushedCount: 0, pulledCount: 0, conflictCount: 0 };
    }

    let pushedCount = 0;
    let pulledCount = 0;
    let conflictCount = 0;
    let networkAborted = false;

    syncStore.setSyncing(true);
    syncStore.setLastError(null);

    try {
      const localState = await getOrCreateLocalSyncState(shopId);

      // 1. Push pending operations respecting causal dependency order
      while (true) {
        const batch = await getRunnableOutboxOps(shopId, Date.now(), 50);
        if (batch.length === 0) {
          break;
        }

        await markOutboxOpsInFlight(
          shopId,
          batch.map((item) => item.clientOpId),
        );
        await useSyncStore.getState().refreshFromLocalDb(shopId);

        let pushResponse;
        try {
          pushResponse = await syncApi.push({
            deviceId: localState.deviceId,
            operations: batch.map(toSyncPushOpInput),
          });
        } catch (err) {
          const isRetryableTransportError =
            err instanceof ApiClientError
              ? err.code === 'NETWORK_ERROR' || err.statusCode >= 500 || err.statusCode === 429
              : true;

          const message =
            err instanceof Error ? err.message : 'Network error during sync push';

          if (isRetryableTransportError) {
            for (const op of batch) {
              await markOutboxOpRetryable(shopId, op.clientOpId, message);
            }
            useSyncStore.getState().setLastError(message);
            networkAborted = true;
            break;
          }

          for (const op of batch) {
            await markOutboxOpConflictResult(shopId, {
              clientOpId: op.clientOpId,
              idempotencyKey: op.idempotencyKey,
              opType: op.opType,
              entityType: op.entityType,
              entityId: op.entityId,
              status: 'ACTION_REQUIRED',
              syncSeq: null,
              replayed: false,
              conflictKind: 'VALIDATION_ERROR',
              conflictMessage: message,
              serverVersion: null,
              serverSnapshot: null,
            });
            conflictCount += 1;
          }
          break;
        }

        let syncedInBatch = 0;
        for (const result of pushResponse.results) {
          if (result.status === 'SYNCED') {
            await markOutboxOpSynced(shopId, result.clientOpId, result.warnings ?? []);
            await applySyncedPushEntityIfSafe(shopId, result);
            pushedCount += 1;
            syncedInBatch += 1;
          } else {
            await markOutboxOpConflictResult(shopId, result);
            conflictCount += 1;
          }
        }

        if (syncedInBatch === 0) {
          break;
        }
      }

      // 2. Pull delta changes since local syncSeq cursor
      if (!networkAborted) {
        let hasMore = true;
        while (hasMore) {
          const latestState = await getOrCreateLocalSyncState(shopId);
          const pullResponse = await syncApi.pull(latestState.lastSyncSeq, 200);

          if (pullResponse.shop) {
            await useAuthStore.getState().updateLocalShop(pullResponse.shop);
          }

          for (const change of pullResponse.changes) {
            const applied = await applyPullChangeIfSafe(shopId, change);
            if (applied) {
              pulledCount += 1;
            }
          }

          await updateLocalSyncCursor(shopId, pullResponse.nextCursor, pullResponse.serverTime);
          hasMore = pullResponse.hasMore && pullResponse.nextCursor > latestState.lastSyncSeq;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      useSyncStore.getState().setLastError(message);
    } finally {
      useSyncStore.getState().setSyncing(false);
      await useSyncStore.getState().refreshFromLocalDb(shopId);
      if (pushedCount > 0 || pulledCount > 0) {
        await invalidateSyncedQueries(queryClient);
      }
    }

    return { pushedCount, pulledCount, conflictCount };
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

export async function resolveKeepMine(
  shopId: string,
  item: LocalSyncOutboxRecord,
  queryClient?: QueryClient,
): Promise<RunSyncResult> {
  const snapshotVersion =
    item.serverSnapshot && typeof item.serverSnapshot.version === 'number'
      ? item.serverSnapshot.version
      : null;
  const targetVersion = item.serverVersion ?? snapshotVersion ?? item.baseVersion ?? 1;

  await requeueOutboxOpForRetry(shopId, item.clientOpId, {
    overrideVersion: targetVersion,
  });
  await useSyncStore.getState().refreshFromLocalDb(shopId);
  return runSyncNow(queryClient, { force: true });
}

export async function resolveUseServer(
  shopId: string,
  item: LocalSyncOutboxRecord,
  queryClient?: QueryClient,
): Promise<void> {
  if (item.opType === SyncOperationTypes.CREATE_SALE) {
    await rollbackConflictedLocalSaleIfNeeded(shopId, item.localSnapshot);
  } else if (item.serverSnapshot) {
    await applyEntitySnapshotToLocal(shopId, item.entityType, item.serverSnapshot);
  }

  await discardOutboxOp(shopId, item.clientOpId);
  await useSyncStore.getState().refreshFromLocalDb(shopId);
  await invalidateSyncedQueries(queryClient);
}

export async function resolveForceNegativeStockSync(
  shopId: string,
  clientOpId: string,
  queryClient?: QueryClient,
): Promise<RunSyncResult> {
  await requeueOutboxOpForRetry(shopId, clientOpId, {
    forceAllowNegativeStock: true,
  });
  await useSyncStore.getState().refreshFromLocalDb(shopId);
  return runSyncNow(queryClient, { force: true });
}

export async function resolveRetryOp(
  shopId: string,
  clientOpId: string,
  queryClient?: QueryClient,
): Promise<RunSyncResult> {
  await requeueOutboxOpForRetry(shopId, clientOpId);
  await useSyncStore.getState().refreshFromLocalDb(shopId);
  return runSyncNow(queryClient, { force: true });
}

export async function resolveDiscardOp(
  shopId: string,
  item: LocalSyncOutboxRecord,
  queryClient?: QueryClient,
): Promise<void> {
  if (item.opType === SyncOperationTypes.CREATE_SALE) {
    await rollbackConflictedLocalSaleIfNeeded(shopId, item.localSnapshot);
  }
  await discardOutboxOp(shopId, item.clientOpId);
  await useSyncStore.getState().refreshFromLocalDb(shopId);
  await invalidateSyncedQueries(queryClient);
}

export function startSyncEngine(queryClient: QueryClient): void {
  stopSyncEngine();

  const auth = useAuthStore.getState();
  if (auth.status !== 'authenticated' || !auth.shop?.id) {
    return;
  }

  void useSyncStore.getState().refreshFromLocalDb(auth.shop.id);

  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const nextOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    const wasOffline = previousOnlineState === false;
    previousOnlineState = nextOnline;
    useSyncStore.getState().setOnline(nextOnline);

    if (nextOnline) {
      const activeShopId = useAuthStore.getState().shop?.id;
      if (wasOffline && activeShopId) {
        void resetRetryBackoffOnReconnect(activeShopId).then(() => runSyncNow(queryClient));
      } else {
        void runSyncNow(queryClient);
      }
    }
  });

  appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      void runSyncNow(queryClient);
    }
  });

  intervalHandle = setInterval(() => {
    void runSyncNow(queryClient);
  }, SYNC_INTERVAL_MS);
  if (typeof intervalHandle === 'object' && intervalHandle !== null && 'unref' in intervalHandle) {
    (intervalHandle as { unref?: () => void }).unref?.();
  }
}

export function stopSyncEngine(): void {
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  previousOnlineState = null;
}
