import {
  SyncEntityTypes,
  SyncOperationTypes,
  SyncOutboxStatuses,
  type AuthUserDto,
  type CustomerDto,
  type ProductDto,
  type ShopProfileDto,
} from '@dokanwala/shared';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import SyncCenterScreen from '@/app/sync/index';
import { SyncStatusPill } from '@/components/feedback/SyncStatusPill';
import {
  loadLocalProductById,
  upsertLocalProduct,
} from '@/database/repositories/catalog-local.repo';
import {
  collectOfflineCustomerPaymentWithOutbox,
  createOfflineCustomerWithOutbox,
  createOfflineSaleWithOutbox,
  updateOfflineProductWithOutbox,
  type OfflineActorContext,
} from '@/database/repositories/offline-writes.repo';
import {
  loadLocalCustomerById,
  upsertLocalCustomer,
} from '@/database/repositories/sales-local.repo';
import {
  calculateBackoffDelayMs,
  getOrCreateLocalSyncState,
  getSyncCounts,
  isEntityProtectedFromPull,
  loadSyncOutboxItems,
  markOutboxOpConflictResult,
  markOutboxOpsInFlight,
  recoverInFlightSyncOpsOnStartup,
} from '@/database/repositories/sync-outbox.repo';
import {
  resetLocalDatabaseInstanceForTests,
  type SqliteBindValue,
  type SqliteDatabaseAdapter,
} from '@/database/sqlite';
import bnTranslations from '@/i18n/bn.json';
import enTranslations from '@/i18n/en.json';
import { ApiClientError } from '@/services/api/client';
import { syncApi } from '@/services/api/sync';
import {
  runSyncNow,
  startSyncEngine,
  stopSyncEngine,
} from '@/services/sync/sync-engine';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useSyncStore } from '@/store/sync.store';

function collectLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectLeafKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

const TABLE_KEYS: Record<string, (row: Record<string, unknown>) => string> = {
  products_local: (r) => String(r.id),
  product_units_local: (r) => String(r.id),
  inventory_balances_local: (r) => String(r.product_id),
  customers_local: (r) => String(r.id),
  sales_local: (r) => String(r.id),
  sale_items_local: (r) => String(r.id),
  payments_local: (r) => String(r.id),
  sale_returns_local: (r) => String(r.id),
  sale_return_items_local: (r) => String(r.id),
  customer_payments_local: (r) => String(r.id),
  sync_outbox: (r) => String(r.client_op_id),
  sync_state: (r) => String(r.shop_id),
  sync_entity_flags: (r) => `${String(r.shop_id)}::${String(r.entity_type)}::${String(r.entity_id)}`,
};

function createInMemorySyncSqliteAdapter(): SqliteDatabaseAdapter {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();

  const getTable = (name: string): Map<string, Record<string, unknown>> => {
    const normalized = name.toLowerCase();
    let table = tables.get(normalized);
    if (!table) {
      table = new Map<string, Record<string, unknown>>();
      tables.set(normalized, table);
    }
    return table;
  };

  return {
    async execAsync() {},
    async runAsync(source, ...params) {
      const sql = source.trim().replace(/\s+/g, ' ');
      const upper = sql.toUpperCase();

      const insertMatch = sql.match(
        /INSERT OR REPLACE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      );
      if (insertMatch) {
        const tableName = insertMatch[1]!.toLowerCase();
        const cols = insertMatch[2]!.split(',').map((c) => c.trim());
        const record: Record<string, unknown> = {};
        cols.forEach((col, idx) => {
          record[col] = params[idx] ?? null;
        });
        const keyFn = TABLE_KEYS[tableName] ?? ((r) => String(r.id ?? JSON.stringify(r)));
        getTable(tableName).set(keyFn(record), record);
        return { changes: 1, lastInsertRowId: 1 };
      }

      if (upper.startsWith('DELETE FROM SYNC_OUTBOX WHERE SHOP_ID = ? AND CLIENT_OP_ID = ?')) {
        const t = getTable('sync_outbox');
        t.delete(String(params[1]));
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (upper.startsWith('DELETE FROM SYNC_ENTITY_FLAGS WHERE SHOP_ID = ?')) {
        const t = getTable('sync_entity_flags');
        t.delete(`${String(params[0])}::${String(params[1])}::${String(params[2])}`);
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (upper.startsWith('DELETE FROM SYNC_OUTBOX')) {
        getTable('sync_outbox').clear();
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (upper.startsWith('DELETE FROM SYNC_STATE')) {
        getTable('sync_state').clear();
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (upper.startsWith('DELETE FROM SYNC_ENTITY_FLAGS')) {
        getTable('sync_entity_flags').clear();
        return { changes: 1, lastInsertRowId: 0 };
      }

      const deleteByCol = sql.match(/DELETE FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i);
      if (deleteByCol) {
        const t = getTable(deleteByCol[1]!.toLowerCase());
        const col = deleteByCol[2]!;
        for (const [k, row] of Array.from(t.entries())) {
          if (row[col] === params[0]) {
            t.delete(k);
          }
        }
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (upper.startsWith('UPDATE SYNC_OUTBOX SET STATUS = \'PENDING\'')) {
        const t = getTable('sync_outbox');
        let changes = 0;
        for (const row of t.values()) {
          if (row.status === 'IN_FLIGHT') {
            row.status = 'PENDING';
            row.next_retry_at_ms = 0;
            row.updated_at_ms = params[0];
            changes += 1;
          }
        }
        return { changes, lastInsertRowId: 0 };
      }

      if (upper.startsWith('UPDATE SYNC_OUTBOX SET STATUS = \'IN_FLIGHT\'')) {
        const row = getTable('sync_outbox').get(String(params[2]));
        if (row && row.shop_id === params[1]) {
          row.status = 'IN_FLIGHT';
          row.updated_at_ms = params[0];
        }
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (upper.startsWith('UPDATE SYNC_OUTBOX SET STATUS = \'SYNCED\'')) {
        const row = getTable('sync_outbox').get(String(params[3]));
        if (row && row.shop_id === params[2]) {
          row.status = 'SYNCED';
          row.conflict_kind = null;
          row.conflict_message = null;
          row.server_version = null;
          row.server_snapshot_json = null;
          row.warnings_json = params[0] ?? null;
          row.updated_at_ms = params[1];
        }
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (upper.startsWith('UPDATE SYNC_OUTBOX SET STATUS = \'FAILED_RETRYABLE\'')) {
        const row = getTable('sync_outbox').get(String(params[5]));
        if (row && row.shop_id === params[4]) {
          row.status = 'FAILED_RETRYABLE';
          row.retry_count = params[0];
          row.next_retry_at_ms = params[1];
          row.conflict_message = params[2];
          row.updated_at_ms = params[3];
        }
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (upper.startsWith('UPDATE SYNC_OUTBOX SET STATUS = ?, CONFLICT_KIND = ?')) {
        const row = getTable('sync_outbox').get(String(params[7]));
        if (row && row.shop_id === params[6]) {
          row.status = params[0];
          row.conflict_kind = params[1];
          row.conflict_message = params[2];
          row.server_version = params[3];
          row.server_snapshot_json = params[4];
          row.updated_at_ms = params[5];
        }
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (upper.startsWith('UPDATE SYNC_OUTBOX SET NEXT_RETRY_AT_MS = 0')) {
        for (const row of getTable('sync_outbox').values()) {
          if (row.shop_id === params[1] && row.status === 'FAILED_RETRYABLE') {
            row.next_retry_at_ms = 0;
            row.updated_at_ms = params[0];
          }
        }
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (upper.startsWith('UPDATE SYNC_OUTBOX SET IDEMPOTENCY_KEY = ?')) {
        const row = getTable('sync_outbox').get(String(params[5]));
        if (row && row.shop_id === params[4]) {
          row.idempotency_key = params[0];
          row.base_version = params[1];
          row.payload_json = params[2];
          row.status = 'PENDING';
          row.retry_count = 0;
          row.next_retry_at_ms = 0;
          row.conflict_kind = null;
          row.conflict_message = null;
          row.server_version = null;
          row.server_snapshot_json = null;
          row.updated_at_ms = params[3];
        }
        return { changes: 1, lastInsertRowId: 0 };
      }

      return { changes: 0, lastInsertRowId: 0 };
    },

    async getFirstAsync<T>(source: string, ...params: SqliteBindValue[]): Promise<T | null> {
      const rows = await this.getAllAsync<T>(source, ...params);
      return rows[0] ?? null;
    },

    async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
      const sql = source.trim().replace(/\s+/g, ' ');
      const upper = sql.toUpperCase();

      if (upper.includes('COALESCE(MAX(SEQUENCE_NO), 0) AS MAX_SEQ FROM SYNC_OUTBOX')) {
        let maxSeq = 0;
        for (const row of getTable('sync_outbox').values()) {
          maxSeq = Math.max(maxSeq, Number(row.sequence_no ?? 0));
        }
        return [{ max_seq: maxSeq } as T];
      }

      if (upper.includes('FROM SYNC_OUTBOX WHERE STATUS = \'IN_FLIGHT\'')) {
        return Array.from(getTable('sync_outbox').values()).filter(
          (r) => r.status === 'IN_FLIGHT',
        ) as T[];
      }

      if (upper.includes('FROM SYNC_OUTBOX WHERE SHOP_ID = ? AND ENTITY_TYPE = ? AND ENTITY_ID = ?')) {
        return Array.from(getTable('sync_outbox').values()).filter(
          (r) =>
            r.shop_id === params[0] &&
            r.entity_type === params[1] &&
            r.entity_id === params[2],
        ) as T[];
      }

      if (upper.includes('FROM SYNC_OUTBOX WHERE SHOP_ID = ? AND CLIENT_OP_ID = ?')) {
        const row = getTable('sync_outbox').get(String(params[1]));
        return row && row.shop_id === params[0] ? [row as T] : [];
      }

      if (upper.includes('FROM SYNC_OUTBOX WHERE SHOP_ID = ?')) {
        return Array.from(getTable('sync_outbox').values())
          .filter((r) => r.shop_id === params[0])
          .sort((a, b) => Number(a.sequence_no) - Number(b.sequence_no)) as T[];
      }

      if (upper.includes('FROM SYNC_STATE WHERE SHOP_ID = ?')) {
        const row = getTable('sync_state').get(String(params[0]));
        return row ? [row as T] : [];
      }

      if (upper.includes('FROM SYNC_ENTITY_FLAGS WHERE SHOP_ID = ? AND ENTITY_TYPE = ? AND ENTITY_ID = ?')) {
        const row = getTable('sync_entity_flags').get(
          `${String(params[0])}::${String(params[1])}::${String(params[2])}`,
        );
        return row ? [row as T] : [];
      }

      if (upper.includes('FROM PRODUCTS_LOCAL WHERE ID = ?')) {
        const row = getTable('products_local').get(String(params[0]));
        return row ? [row as T] : [];
      }

      if (upper.includes('FROM PRODUCTS_LOCAL WHERE SHOP_ID = ?')) {
        return Array.from(getTable('products_local').values()).filter(
          (r) => r.shop_id === params[0],
        ) as T[];
      }

      if (upper.includes('FROM PRODUCT_UNITS_LOCAL WHERE PRODUCT_ID = ?')) {
        return Array.from(getTable('product_units_local').values()).filter(
          (r) => r.product_id === params[0],
        ) as T[];
      }

      if (upper.includes('FROM PRODUCT_UNITS_LOCAL')) {
        return Array.from(getTable('product_units_local').values()) as T[];
      }

      if (upper.includes('FROM INVENTORY_BALANCES_LOCAL WHERE PRODUCT_ID = ?')) {
        const row = getTable('inventory_balances_local').get(String(params[0]));
        return row ? [row as T] : [];
      }

      if (upper.includes('FROM INVENTORY_BALANCES_LOCAL WHERE SHOP_ID = ?')) {
        return Array.from(getTable('inventory_balances_local').values()).filter(
          (r) => r.shop_id === params[0],
        ) as T[];
      }

      if (upper.includes('FROM CUSTOMERS_LOCAL WHERE ID = ?')) {
        const row = getTable('customers_local').get(String(params[0]));
        return row ? [row as T] : [];
      }

      if (upper.includes('FROM CUSTOMERS_LOCAL WHERE SHOP_ID = ?')) {
        return Array.from(getTable('customers_local').values()).filter(
          (r) => r.shop_id === params[0],
        ) as T[];
      }

      if (upper.includes('FROM CUSTOMER_PAYMENTS_LOCAL WHERE SHOP_ID = ?')) {
        return Array.from(getTable('customer_payments_local').values()).filter(
          (r) => r.shop_id === params[0],
        ) as T[];
      }

      if (upper.includes('FROM SALES_LOCAL WHERE ID = ?')) {
        const row = getTable('sales_local').get(String(params[0]));
        return row ? [row as T] : [];
      }

      if (upper.includes('FROM SALE_ITEMS_LOCAL WHERE SALE_ID = ?')) {
        return Array.from(getTable('sale_items_local').values()).filter(
          (r) => r.sale_id === params[0],
        ) as T[];
      }

      if (upper.includes('FROM PAYMENTS_LOCAL WHERE SALE_ID = ?')) {
        return Array.from(getTable('payments_local').values()).filter(
          (r) => r.sale_id === params[0],
        ) as T[];
      }

      return [];
    },

    async withTransactionAsync(task) {
      await task();
    },
  };
}

const SHOP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EMP_ID = '33333333-3333-4333-8333-333333333333';
const PROD_PAN_ID = '44444444-4444-4444-8444-444444444444';
const CUST_ID = '55555555-5555-4555-8555-555555555555';
const UNIT_PIECE_ID = '66666666-6666-4666-8666-666666666661';
const UNIT_BIRA_ID = '66666666-6666-4666-8666-666666666662';

const sampleShop: ShopProfileDto = {
  id: SHOP_ID,
  nameBn: 'রহিম স্টোর',
  nameEn: 'Rahim Store',
  addressBn: null,
  addressEn: null,
  phone: '+8801711223344',
  logoUrl: null,
  currencyCode: 'BDT',
  timezone: 'Asia/Dhaka',
  defaultLanguage: 'bn',
  defaultDigitStyle: 'bn',
  receiptHeaderBn: null,
  receiptFooterBn: 'ধন্যবাদ',
  allowNegativeStock: false,
  employeeCanGiveCredit: true,
  employeeMaxDiscountPercent: 5,
  isActive: true,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleOwner: AuthUserDto = {
  id: USER_ID,
  shopId: SHOP_ID,
  name: 'আব্দুর রহিম',
  phone: '+8801711223344',
  role: 'OWNER',
  hasPin: true,
  preferredLanguage: 'bn',
  preferredDigitStyle: 'bn',
  isActive: true,
  createdAt: '2026-11-12T00:00:00.000Z',
};

const sampleEmployee: AuthUserDto = {
  ...sampleOwner,
  id: EMP_ID,
  name: 'করিম কর্মচারী',
  phone: '+8801811000011',
  role: 'EMPLOYEE',
};

function makePanProduct(overrides?: Partial<ProductDto>): ProductDto {
  return {
    id: PROD_PAN_ID,
    shopId: SHOP_ID,
    categoryId: null,
    categoryNameBn: null,
    categoryNameEn: null,
    nameBn: 'রাজশাহীর পান',
    nameEn: 'Rajshahi Pan',
    barcode: null,
    imageUrl: null,
    defaultSupplierName: null,
    baseUnitId: UNIT_PIECE_ID,
    baseUnitCode: 'PIECE',
    baseUnitNameBn: 'টি',
    baseUnitNameEn: 'Piece',
    defaultSaleUnitId: UNIT_BIRA_ID,
    defaultPurchaseUnitId: UNIT_BIRA_ID,
    baseSellingPricePoisha: 200,
    lastPurchasePricePoisha: 120,
    lowStockThresholdBase: '20.0000',
    isLowStock: false,
    isActive: true,
    version: 1,
    units: [
      {
        id: 'pu-piece',
        productId: PROD_PAN_ID,
        unitId: UNIT_PIECE_ID,
        unitCode: 'PIECE',
        unitNameBn: 'টি',
        unitNameEn: 'Piece',
        isFractional: false,
        conversionFactorToBase: '1',
        sellingPricePoisha: 200,
        isBaseUnit: true,
        isDefaultSaleUnit: false,
        isDefaultPurchaseUnit: false,
      },
      {
        id: 'pu-bira',
        productId: PROD_PAN_ID,
        unitId: UNIT_BIRA_ID,
        unitCode: 'BIRA',
        unitNameBn: 'বিড়া',
        unitNameEn: 'Bira',
        isFractional: false,
        conversionFactorToBase: '20',
        sellingPricePoisha: 3500,
        isBaseUnit: false,
        isDefaultSaleUnit: true,
        isDefaultPurchaseUnit: true,
      },
    ],
    inventory: {
      productId: PROD_PAN_ID,
      qtyBase: '100.0000',
      avgCostPerBaseBdt: '1.2500',
      valuationPoisha: 12500,
      version: 1,
      updatedAt: '2026-11-12T00:00:00.000Z',
    },
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    ...overrides,
  };
}

function makeCustomer(overrides?: Partial<CustomerDto>): CustomerDto {
  return {
    id: CUST_ID,
    shopId: SHOP_ID,
    nameBn: 'জসিম মিয়া',
    nameEn: 'Jasim Mia',
    phone: '+8801722334455',
    address: 'রামপুরা বাজার',
    note: null,
    totalPurchasedPoisha: 0,
    totalPaidPoisha: 0,
    duePoisha: 0,
    isActive: true,
    version: 1,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    ...overrides,
  };
}

const actorCtx: OfflineActorContext = {
  shopId: SHOP_ID,
  userId: USER_ID,
  userName: 'আব্দুর রহিম',
  shop: sampleShop,
};

describe('Phase 8 Offline Synchronization & Conflict Inspector', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.restoreAllMocks();
    stopSyncEngine();
    (NetInfo as unknown as { __resetMockState: () => void }).__resetMockState();
    resetLocalDatabaseInstanceForTests(createInMemorySyncSqliteAdapter());
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    useAuthStore.setState({
      status: 'authenticated',
      user: sampleOwner,
      shop: sampleShop,
    });
    usePreferencesStore.setState({
      language: 'bn',
      digitStyle: 'bn',
      syncIndicator: 'synced',
      pendingSyncCount: 0,
    });
    useSyncStore.getState().resetSyncStore();
  });

  afterEach(async () => {
    stopSyncEngine();
    await cleanup();
    queryClient.clear();
    useSyncStore.getState().resetSyncStore();
    resetLocalDatabaseInstanceForTests(null);
  });

  it('maintains 100% key parity between bn.json and en.json including all sync keys', () => {
    const bnKeys = collectLeafKeys(bnTranslations as Record<string, unknown>);
    const enKeys = collectLeafKeys(enTranslations as Record<string, unknown>);
    expect(bnKeys).toEqual(enKeys);
    expect(bnKeys).toContain('sync.centerTitle');
    expect(bnKeys).toContain('sync.keepMineButton');
    expect(bnKeys).toContain('sync.useServerButton');
    expect(bnKeys).toContain('sync.forceNegativeStockButton');
    expect(bnKeys).toContain('more.syncCenter');
  });

  it('computes exponential backoff schedule (2s, 5s, 15s, 60s, 300s) with +/-20% jitter', () => {
    expect(calculateBackoffDelayMs(1, 0.8)).toBe(1600);
    expect(calculateBackoffDelayMs(1, 1.2)).toBe(2400);
    expect(calculateBackoffDelayMs(2, 1.0)).toBe(5000);
    expect(calculateBackoffDelayMs(3, 1.0)).toBe(15000);
    expect(calculateBackoffDelayMs(4, 1.0)).toBe(60000);
    expect(calculateBackoffDelayMs(5, 1.0)).toBe(300000);
    expect(calculateBackoffDelayMs(8, 1.0)).toBe(300000);
  });

  it('handles offline sale -> crash recovery -> NetInfo reconnect -> idempotent push & pull without silent overwrite', async () => {
    const pan = makePanProduct();
    const cust = makeCustomer();
    await upsertLocalProduct(pan);
    await upsertLocalCustomer(cust);

    // Go offline
    (NetInfo as unknown as { __setMockState: (s: { isConnected: boolean; isInternetReachable: boolean }) => void }).__setMockState({
      isConnected: false,
      isInternetReachable: false,
    });
    startSyncEngine(queryClient);

    // Offline credit sale: 2 বিড়া @ ৳35 = ৳70 (7000 poisha), paid 0
    const sale = await createOfflineSaleWithOutbox(
      actorCtx,
      {
        customerId: CUST_ID,
        items: [{ productId: PROD_PAN_ID, unitId: UNIT_BIRA_ID, qtyDisplay: '2' }],
        payments: [],
      },
      'offline-sale-idem-1',
    );
    await useSyncStore.getState().refreshFromLocalDb(SHOP_ID);

    // Verify immediate SQLite stock + customer due + outbox state + Bangla SyncStatusPill
    const updatedPan = await loadLocalProductById(PROD_PAN_ID);
    const updatedCust = await loadLocalCustomerById(CUST_ID);
    expect(updatedPan?.inventory.qtyBase).toBe('60.0000');
    expect(updatedCust?.duePoisha).toBe(7000);
    expect(await isEntityProtectedFromPull(SHOP_ID, SyncEntityTypes.SALE, sale.id)).toBe(true);

    await render(<SyncStatusPill />);
    expect(screen.getByText('অপেক্ষমাণ (১টি)')).toBeTruthy();
    await cleanup();

    // Simulate crash mid-push (`IN_FLIGHT`), then startup recovery -> back to `PENDING`
    const outboxBeforeCrash = await loadSyncOutboxItems(SHOP_ID);
    expect(outboxBeforeCrash).toHaveLength(1);
    const saleOpId = outboxBeforeCrash[0]!.clientOpId;
    await markOutboxOpsInFlight(SHOP_ID, [saleOpId]);
    const recoveredCount = await recoverInFlightSyncOpsOnStartup();
    expect(recoveredCount).toBe(1);
    const recoveredItems = await loadSyncOutboxItems(SHOP_ID);
    expect(recoveredItems[0]!.status).toBe(SyncOutboxStatuses.PENDING);

    // First reconnect attempt hits transient NETWORK_ERROR -> marks FAILED_RETRYABLE
    const pushSpy = jest
      .spyOn(syncApi, 'push')
      .mockRejectedValueOnce(
        new ApiClientError({
          code: 'NETWORK_ERROR',
          message: 'Network down',
          statusCode: 0,
        }),
      )
      .mockResolvedValueOnce({
        latestSyncSeq: 12,
        results: [
          {
            clientOpId: saleOpId,
            idempotencyKey: 'offline-sale-idem-1',
            opType: SyncOperationTypes.CREATE_SALE,
            entityType: SyncEntityTypes.SALE,
            entityId: sale.id,
            status: 'SYNCED',
            syncSeq: 12,
            replayed: false,
            appliedEntity: { ...sale, status: 'COMPLETED' } as unknown as Record<string, unknown>,
            warnings: ['OFFLINE_PRICE_VARIANCE'],
          },
        ],
      });

    const pullSpy = jest.spyOn(syncApi, 'pull').mockResolvedValue({
      serverTime: '2026-11-12T10:00:05.000Z',
      cursor: 0,
      nextCursor: 15,
      hasMore: false,
      shop: sampleShop,
      changes: [
        {
          syncSeq: 15,
          entityType: SyncEntityTypes.PRODUCT,
          entityId: PROD_PAN_ID,
          action: 'UPSERT',
          payload: makePanProduct({
            baseSellingPricePoisha: 240,
            version: 2,
          }) as unknown as Record<string, unknown>,
          occurredAt: '2026-11-12T10:00:04.000Z',
        },
      ],
    });

    // Offline again briefly then reconnect triggers backoff reset + push
    await runSyncNow(queryClient, { force: true });
    expect((await getSyncCounts(SHOP_ID)).retryableCount).toBe(1);

    (NetInfo as unknown as { __setMockState: (s: { isConnected: boolean; isInternetReachable: boolean }) => void }).__setMockState({
      isConnected: true,
      isInternetReachable: true,
    });

    await waitFor(async () => {
      const counts = await getSyncCounts(SHOP_ID);
      expect(counts.totalUnresolvedCount).toBe(0);
    });

    expect(pushSpy).toHaveBeenCalledTimes(2);
    expect(pullSpy).toHaveBeenCalled();

    const syncState = await getOrCreateLocalSyncState(SHOP_ID);
    expect(syncState.lastSyncSeq).toBe(15);

    const syncedPan = await loadLocalProductById(PROD_PAN_ID);
    expect(syncedPan?.baseSellingPricePoisha).toBe(240);
    expect(usePreferencesStore.getState().syncIndicator).toBe('synced');
  });

  it('blocks causally dependent payment behind conflicted customer while allowing independent sale and pull protection', async () => {
    const pan = makePanProduct();
    await upsertLocalProduct(pan);

    useSyncStore.getState().setOnline(true);

    // 1. Offline CREATE_CUSTOMER (seq 1)
    const offlineCust = await createOfflineCustomerWithOutbox(
      actorCtx,
      { nameBn: 'রফিক মিয়া', phone: '০১৭৮৮৯৯০০১১' },
      'cust-idem-1',
    );

    // 2. Independent cash sale (seq 2, no dependency)
    const cashSale = await createOfflineSaleWithOutbox(
      actorCtx,
      {
        items: [{ productId: PROD_PAN_ID, unitId: UNIT_PIECE_ID, qtyDisplay: '5' }],
        payments: [{ method: 'CASH', amountPoisha: 1000 }],
      },
      'cash-sale-idem-2',
    );

    // 3. Dependent due collection (seq 3, depends on offlineCust.id)
    await collectOfflineCustomerPaymentWithOutbox(
      actorCtx,
      offlineCust.id,
      { amountPoisha: 500, method: 'CASH' },
      'cust-pay-idem-3',
    );

    const items = await loadSyncOutboxItems(SHOP_ID);
    expect(items).toHaveLength(3);
    const custOp = items[0]!;
    const saleOp = items[1]!;

    const pushSpy = jest.spyOn(syncApi, 'push').mockResolvedValueOnce({
      latestSyncSeq: 21,
      results: [
        {
          clientOpId: custOp.clientOpId,
          idempotencyKey: 'cust-idem-1',
          opType: SyncOperationTypes.CREATE_CUSTOMER,
          entityType: SyncEntityTypes.CUSTOMER,
          entityId: offlineCust.id,
          status: 'CONFLICT',
          syncSeq: null,
          replayed: false,
          conflictKind: 'VALIDATION_ERROR',
          conflictMessage: 'এই ফোন নম্বরে কাস্টমার আছে',
          serverVersion: 1,
          serverSnapshot: makeCustomer({ id: offlineCust.id, nameBn: 'সার্ভারের রফিক' }) as unknown as Record<string, unknown>,
        },
        {
          clientOpId: saleOp.clientOpId,
          idempotencyKey: 'cash-sale-idem-2',
          opType: SyncOperationTypes.CREATE_SALE,
          entityType: SyncEntityTypes.SALE,
          entityId: cashSale.id,
          status: 'SYNCED',
          syncSeq: 21,
          replayed: false,
          appliedEntity: cashSale as unknown as Record<string, unknown>,
        },
      ],
    });

    // Server pull returns an update to the conflicted customer -> MUST NOT overwrite local offline data
    jest.spyOn(syncApi, 'pull').mockResolvedValueOnce({
      serverTime: '2026-11-12T10:10:02.000Z',
      cursor: 0,
      nextCursor: 25,
      hasMore: false,
      shop: null,
      changes: [
        {
          syncSeq: 25,
          entityType: SyncEntityTypes.CUSTOMER,
          entityId: offlineCust.id,
          action: 'UPSERT',
          payload: makeCustomer({
            id: offlineCust.id,
            nameBn: 'সার্ভারের ওভাররাইট চেষ্টা',
          }) as unknown as Record<string, unknown>,
          occurredAt: '2026-11-12T10:10:01.000Z',
        },
      ],
    });

    const summary = await runSyncNow(queryClient, { force: true });
    expect(summary.pushedCount).toBe(1);
    expect(summary.conflictCount).toBe(1);
    expect(summary.pulledCount).toBe(0);

    // Causal gate: only seq 1 & seq 2 were sent (COLLECT_CUSTOMER_PAYMENT stayed queued!)
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0]![0].operations).toHaveLength(2);
    expect(
      pushSpy.mock.calls[0]![0].operations.some(
        (op) => op.opType === SyncOperationTypes.COLLECT_CUSTOMER_PAYMENT,
      ),
    ).toBe(false);

    // Local customer data must NOT be overwritten by pull
    expect(await isEntityProtectedFromPull(SHOP_ID, SyncEntityTypes.CUSTOMER, offlineCust.id)).toBe(
      true,
    );
    const localCustAfterPull = await loadLocalCustomerById(offlineCust.id);
    expect(localCustAfterPull?.nameBn).toBe('রফিক মিয়া');
  });

  it('renders SyncCenterScreen side-by-side conflicts and resolves Keep Mine, Use Server & Owner-only Negative Stock override', async () => {
    const pan = makePanProduct({ nameBn: 'অফলাইনের পান' });
    await upsertLocalProduct(pan);

    useSyncStore.getState().setOnline(true);

    // Create VERSION_CONFLICT on UPDATE_PRODUCT
    await updateOfflineProductWithOutbox(
      actorCtx,
      PROD_PAN_ID,
      { nameBn: 'অফলাইনের পান নতুন', baseSellingPricePoisha: 210, expectedVersion: 1 },
      undefined,
      'edit-prod-idem-1',
    );
    let outbox = await loadSyncOutboxItems(SHOP_ID);
    const prodOpId = outbox[0]!.clientOpId;

    await markOutboxOpConflictResult(SHOP_ID, {
      clientOpId: prodOpId,
      idempotencyKey: 'edit-prod-idem-1',
      opType: SyncOperationTypes.UPDATE_PRODUCT,
      entityType: SyncEntityTypes.PRODUCT,
      entityId: PROD_PAN_ID,
      status: 'CONFLICT',
      syncSeq: null,
      replayed: false,
      conflictKind: 'VERSION_CONFLICT',
      conflictMessage: 'পণ্যটি অন্য ডিভাইস থেকে বদলেছে',
      serverVersion: 2,
      serverSnapshot: makePanProduct({
        nameBn: 'সার্ভারের পান',
        baseSellingPricePoisha: 260,
        version: 2,
      }) as unknown as Record<string, unknown>,
    });

    await useSyncStore.getState().refreshFromLocalDb(SHOP_ID);

    const pushSpy = jest.spyOn(syncApi, 'push').mockResolvedValueOnce({
      latestSyncSeq: 30,
      results: [
        {
          clientOpId: prodOpId,
          idempotencyKey: 'resolved-keep-mine',
          opType: SyncOperationTypes.UPDATE_PRODUCT,
          entityType: SyncEntityTypes.PRODUCT,
          entityId: PROD_PAN_ID,
          status: 'SYNCED',
          syncSeq: 30,
          replayed: false,
          appliedEntity: makePanProduct({
            nameBn: 'অফলাইনের পান নতুন',
            baseSellingPricePoisha: 210,
            version: 3,
          }) as unknown as Record<string, unknown>,
        },
      ],
    });
    jest.spyOn(syncApi, 'pull').mockResolvedValue({
      serverTime: '2026-11-12T10:20:01.000Z',
      cursor: 0,
      nextCursor: 30,
      hasMore: false,
      shop: null,
      changes: [],
    });

    await render(
      <QueryClientProvider client={queryClient}>
        <SyncCenterScreen />
      </QueryClientProvider>,
    );

    expect(screen.getByText('সিঙ্ক ও অফলাইন কিউ')).toBeTruthy();
    expect(screen.getByText('সার্ভারের তথ্য (সংস্করণ ২)')).toBeTruthy();
    expect(screen.getByText('সার্ভারের পান')).toBeTruthy();
    expect(screen.getByTestId(`sync-keep-mine-${prodOpId}`)).toBeTruthy();
    expect(screen.getByTestId(`sync-use-server-${prodOpId}`)).toBeTruthy();

    // Press "আমারটা রাখুন" (Keep Mine)
    await fireEvent.press(screen.getByTestId(`sync-keep-mine-${prodOpId}`));

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledTimes(1);
    });
    const pushedOp = pushSpy.mock.calls[0]![0].operations[0]!;
    expect(pushedOp.baseVersion).toBe(2);
    expect(pushedOp.idempotencyKey).not.toBe('edit-prod-idem-1');
    expect(screen.getByText('কোনো অমিল বা আটকে যাওয়া কাজ নেই।')).toBeTruthy();

    await cleanup();

    // Test INSUFFICIENT_STOCK: EMPLOYEE sees Owner-required note; OWNER sees Force button
    const negSale = await createOfflineSaleWithOutbox(
      actorCtx,
      {
        items: [{ productId: PROD_PAN_ID, unitId: UNIT_BIRA_ID, qtyDisplay: '50' }],
        payments: [{ method: 'CASH', amountPoisha: 175000 }],
      },
      'oversell-idem-1',
    );
    outbox = await loadSyncOutboxItems(SHOP_ID);
    const stockOpId = outbox.find((i) => i.entityId === negSale.id)!.clientOpId;
    await markOutboxOpConflictResult(SHOP_ID, {
      clientOpId: stockOpId,
      idempotencyKey: 'oversell-idem-1',
      opType: SyncOperationTypes.CREATE_SALE,
      entityType: SyncEntityTypes.SALE,
      entityId: negSale.id,
      status: 'CONFLICT',
      syncSeq: null,
      replayed: false,
      conflictKind: 'INSUFFICIENT_STOCK',
      conflictMessage: 'রাজশাহীর পান — স্টক যথেষ্ট নয়',
      serverVersion: 3,
      serverSnapshot: { availableQtyBase: '10.0000', requestedQtyBase: '1000.0000' },
    });
    await useSyncStore.getState().refreshFromLocalDb(SHOP_ID);

    useAuthStore.setState({ user: sampleEmployee });
    await render(
      <QueryClientProvider client={queryClient}>
        <SyncCenterScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByText('ঘাটতি স্টক অনুমোদনের জন্য মালিক অ্যাকাউন্ট প্রয়োজন।')).toBeTruthy();
    expect(screen.queryByTestId(`sync-force-stock-${stockOpId}`)).toBeNull();
    await cleanup();

    // Switch to OWNER and force negative stock override
    useAuthStore.setState({ user: sampleOwner });
    pushSpy.mockResolvedValueOnce({
      latestSyncSeq: 35,
      results: [
        {
          clientOpId: stockOpId,
          idempotencyKey: 'resolved-force-stock',
          opType: SyncOperationTypes.CREATE_SALE,
          entityType: SyncEntityTypes.SALE,
          entityId: negSale.id,
          status: 'SYNCED',
          syncSeq: 35,
          replayed: false,
          appliedEntity: negSale as unknown as Record<string, unknown>,
          warnings: ['LOW_STOCK_DISCREPANCY'],
        },
      ],
    });

    await render(
      <QueryClientProvider client={queryClient}>
        <SyncCenterScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId(`sync-force-stock-${stockOpId}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`sync-force-stock-${stockOpId}`));

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledTimes(2);
    });
    expect(pushSpy.mock.calls[1]![0].operations[0]!.payload.forceAllowNegativeStock).toBe(true);
    expect(screen.getByText('কোনো অমিল বা আটকে যাওয়া কাজ নেই।')).toBeTruthy();

    await cleanup();

    // Test "Use Server" resolution restores server snapshot & clears outbox conflict
    const serverWinsPan = makePanProduct({
      nameBn: 'অফলাইনের নাম বাতিল',
      baseSellingPricePoisha: 190,
      version: 3,
    });
    await upsertLocalProduct(serverWinsPan);
    await updateOfflineProductWithOutbox(
      actorCtx,
      PROD_PAN_ID,
      { nameBn: 'অফলাইনের নাম বাতিল', baseSellingPricePoisha: 190, expectedVersion: 3 },
      undefined,
      'use-server-idem-1',
    );
    outbox = await loadSyncOutboxItems(SHOP_ID);
    const useServerOpId = outbox[outbox.length - 1]!.clientOpId;
    await markOutboxOpConflictResult(SHOP_ID, {
      clientOpId: useServerOpId,
      idempotencyKey: 'use-server-idem-1',
      opType: SyncOperationTypes.UPDATE_PRODUCT,
      entityType: SyncEntityTypes.PRODUCT,
      entityId: PROD_PAN_ID,
      status: 'CONFLICT',
      syncSeq: null,
      replayed: false,
      conflictKind: 'VERSION_CONFLICT',
      conflictMessage: 'তথ্য পুরনো',
      serverVersion: 4,
      serverSnapshot: makePanProduct({
        nameBn: 'সার্ভার জয়ী পান',
        baseSellingPricePoisha: 275,
        version: 4,
      }) as unknown as Record<string, unknown>,
    });
    await useSyncStore.getState().refreshFromLocalDb(SHOP_ID);

    await render(
      <QueryClientProvider client={queryClient}>
        <SyncCenterScreen />
      </QueryClientProvider>,
    );
    await fireEvent.press(screen.getByTestId(`sync-use-server-${useServerOpId}`));

    await waitFor(async () => {
      const counts = await getSyncCounts(SHOP_ID);
      expect(counts.conflictCount).toBe(0);
    });
    const restoredProduct = await loadLocalProductById(PROD_PAN_ID);
    expect(restoredProduct?.nameBn).toBe('সার্ভার জয়ী পান');
    expect(restoredProduct?.baseSellingPricePoisha).toBe(275);
  });
});
