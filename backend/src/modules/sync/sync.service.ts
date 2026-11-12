import {
  ErrorCodes,
  SyncOperationTypes,
  type SyncOperationType,
  type SyncPullChangeDto,
  type SyncPullResponse,
  type SyncPushConflictKind,
  type SyncPushOpResultDto,
  type SyncPushResponse,
  type UserRole,
} from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../shared/errors/app-error.js';
import { formatDhakaYmd } from '../../shared/utils/timezone.js';
import type { RequestMeta } from '../../shared/utils/transaction-helpers.js';
import { toShopProfileDto } from '../auth/auth.types.js';
import {
  closeCashbookSession,
  createManualCashbookEntry,
  getCashbookSummary,
  openCashbookSession,
} from '../cashbook/cashbook.service.js';
import {
  closeCashbookSchema,
  createManualCashbookEntrySchema,
  openCashbookSchema,
} from '../cashbook/cashbook.schema.js';
import {
  collectCustomerPayment,
  createCustomer,
  updateCustomer,
} from '../customers/customers.service.js';
import {
  createCustomerPaymentSchema,
  createCustomerSchema,
  updateCustomerSchema,
} from '../customers/customers.schema.js';
import { toCustomerDto } from '../customers/customers.types.js';
import {
  createExpense,
  createExpenseCategory,
  updateExpense,
} from '../expenses/expenses.service.js';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
} from '../expenses/expenses.schema.js';
import {
  expenseInclude,
  toExpenseCategoryDto,
  toExpenseDto,
} from '../expenses/expenses.types.js';
import { createStockAdjustment } from '../inventory/inventory.service.js';
import { createStockAdjustmentSchema } from '../inventory/inventory.schema.js';
import {
  archiveProduct,
  createProduct,
  updateProduct,
} from '../products/products.service.js';
import { createProductSchema, updateProductSchema } from '../products/products.schema.js';
import { productInclude, toProductDto } from '../products/products.types.js';
import { createPurchase } from '../purchases/purchases-create.service.js';
import { createPurchaseReturn } from '../purchases/purchases-return.service.js';
import { createPurchaseReturnSchema, createPurchaseSchema } from '../purchases/purchases.schema.js';
import { purchaseInclude, toPurchaseDto } from '../purchases/purchases.types.js';
import { createSaleFromSync } from '../sales/sales-create.service.js';
import { cancelSale, createSaleReturn } from '../sales/sales-return-cancel.service.js';
import { cancelSaleSchema, createSaleReturnSchema, createSaleSchema } from '../sales/sales.schema.js';
import { saleInclude, toSaleDto } from '../sales/sales.types.js';
import {
  createSupplier,
  createSupplierPayment,
  updateSupplier,
} from '../suppliers/suppliers.service.js';
import {
  createSupplierPaymentSchema,
  createSupplierSchema,
  updateSupplierSchema,
} from '../suppliers/suppliers.schema.js';
import { toSupplierDto } from '../suppliers/suppliers.types.js';
import type { SyncPullQuery, SyncPushInput, SyncPushOpItemInput } from './sync.schema.js';

const OWNER_ONLY_SYNC_OPS = new Set<SyncOperationType>([
  SyncOperationTypes.CREATE_PRODUCT,
  SyncOperationTypes.UPDATE_PRODUCT,
  SyncOperationTypes.ARCHIVE_PRODUCT,
  SyncOperationTypes.CREATE_STOCK_ADJUSTMENT,
  SyncOperationTypes.CANCEL_SALE,
  SyncOperationTypes.CREATE_EXPENSE_CATEGORY,
  SyncOperationTypes.UPDATE_EXPENSE,
  SyncOperationTypes.CREATE_SUPPLIER,
  SyncOperationTypes.UPDATE_SUPPLIER,
  SyncOperationTypes.CREATE_PURCHASE,
  SyncOperationTypes.CREATE_PURCHASE_RETURN,
  SyncOperationTypes.CREATE_SUPPLIER_PAYMENT,
  SyncOperationTypes.CREATE_MANUAL_CASHBOOK_ENTRY,
]);

function readRecordString(obj: Record<string, unknown>, key: string): string | null {
  const val = obj[key];
  return typeof val === 'string' && val.trim().length > 0 ? val : null;
}

function readOfflineItemPrices(payload: Record<string, unknown>): number[] | undefined {
  const raw = payload.offlineItemPrices;
  if (!Array.isArray(raw)) return undefined;
  const nums: number[] = [];
  for (const item of raw) {
    if (typeof item === 'number' && Number.isInteger(item) && item >= 0) {
      nums.push(item);
    }
  }
  return nums.length > 0 ? nums : undefined;
}

function stripExtraSyncFields(
  payload: Record<string, unknown>,
  extraKeys: readonly string[],
): Record<string, unknown> {
  const excluded = new Set(extraKeys);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !excluded.has(key)));
}

interface ExecutedSyncOp {
  appliedEntity: Record<string, unknown> | null;
  warnings: string[];
}

async function executeSyncOperation(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  op: SyncPushOpItemInput,
  meta: RequestMeta,
): Promise<ExecutedSyncOp> {
  if (role === 'EMPLOYEE' && OWNER_ONLY_SYNC_OPS.has(op.opType)) {
    throw new ForbiddenError(
      `Operation ${op.opType} is restricted to shop owners`,
      ErrorCodes.FORBIDDEN_ROLE,
    );
  }

  const opMeta: RequestMeta = {
    ...meta,
    idempotencyKey: op.idempotencyKey,
  };

  switch (op.opType) {
    case SyncOperationTypes.CREATE_PRODUCT: {
      const parsed = createProductSchema.parse({
        id: op.entityId,
        ...op.payload,
      });
      const product = await createProduct(shopId, actorUserId, role, parsed, opMeta);
      return { appliedEntity: product as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.UPDATE_PRODUCT: {
      const parsed = updateProductSchema.parse({
        ...op.payload,
        ...(op.baseVersion !== null &&
        op.baseVersion !== undefined &&
        op.payload.expectedVersion === undefined
          ? { expectedVersion: op.baseVersion }
          : {}),
      });
      const product = await updateProduct(shopId, actorUserId, role, op.entityId, parsed, opMeta);
      return { appliedEntity: product as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.ARCHIVE_PRODUCT: {
      await archiveProduct(shopId, actorUserId, op.entityId, opMeta);
      return { appliedEntity: null, warnings: [] };
    }

    case SyncOperationTypes.CREATE_STOCK_ADJUSTMENT: {
      const parsed = createStockAdjustmentSchema.parse(op.payload);
      const adjustment = await createStockAdjustment(shopId, actorUserId, role, parsed, opMeta);
      return { appliedEntity: adjustment as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_CUSTOMER: {
      const parsed = createCustomerSchema.parse({
        id: op.entityId,
        ...op.payload,
      });
      const customer = await createCustomer(shopId, actorUserId, parsed, opMeta);
      return { appliedEntity: customer as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.UPDATE_CUSTOMER: {
      const parsed = updateCustomerSchema.parse({
        ...op.payload,
        ...(op.baseVersion !== null &&
        op.baseVersion !== undefined &&
        op.payload.expectedVersion === undefined
          ? { expectedVersion: op.baseVersion }
          : {}),
      });
      const customer = await updateCustomer(shopId, actorUserId, op.entityId, parsed, opMeta);
      return { appliedEntity: customer as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_SALE: {
      const offlineItemPrices = readOfflineItemPrices(op.payload);
      const forceAllowNegativeStock =
        role === 'OWNER' && op.payload.forceAllowNegativeStock === true;
      const sanitizedPayload = stripExtraSyncFields(op.payload, [
        'offlineItemPrices',
        'forceAllowNegativeStock',
      ]);
      const parsed = createSaleSchema.parse({
        id: op.entityId,
        ...sanitizedPayload,
      });
      const result = await createSaleFromSync(shopId, actorUserId, role, parsed, opMeta, {
        ...(offlineItemPrices ? { offlineItemPrices } : {}),
        allowNegativeStockOverride: forceAllowNegativeStock,
        ...(op.occurredAt ? { offlineSoldAt: op.occurredAt } : {}),
      });
      return {
        appliedEntity: result.sale as unknown as Record<string, unknown>,
        warnings: result.warnings,
      };
    }

    case SyncOperationTypes.CREATE_SALE_RETURN: {
      const saleId = readRecordString(op.payload, 'saleId') ?? op.entityId;
      const sanitized = stripExtraSyncFields(op.payload, ['saleId']);
      const parsed = createSaleReturnSchema.parse(sanitized);
      const result = await createSaleReturn(shopId, actorUserId, role, saleId, parsed, opMeta);
      return { appliedEntity: result.sale as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CANCEL_SALE: {
      const saleId = readRecordString(op.payload, 'saleId') ?? op.entityId;
      const sanitized = stripExtraSyncFields(op.payload, ['saleId']);
      const parsed = cancelSaleSchema.parse(sanitized);
      const result = await cancelSale(shopId, actorUserId, role, saleId, parsed, opMeta);
      return { appliedEntity: result.sale as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.COLLECT_CUSTOMER_PAYMENT: {
      const customerId = readRecordString(op.payload, 'customerId');
      if (!customerId) {
        throw new ValidationError('customerId is required for COLLECT_CUSTOMER_PAYMENT');
      }
      const sanitized = stripExtraSyncFields(op.payload, ['customerId']);
      const parsed = createCustomerPaymentSchema.parse({
        id: op.entityId,
        ...sanitized,
      });
      const result = await collectCustomerPayment(
        shopId,
        actorUserId,
        role,
        customerId,
        parsed,
        opMeta,
      );
      return { appliedEntity: result.customer as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_EXPENSE_CATEGORY: {
      const parsed = createExpenseCategorySchema.parse({
        id: op.entityId,
        ...op.payload,
      });
      const cat = await createExpenseCategory(shopId, actorUserId, parsed, opMeta);
      return { appliedEntity: cat as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_EXPENSE: {
      const parsed = createExpenseSchema.parse({
        id: op.entityId,
        ...op.payload,
      });
      const result = await createExpense(shopId, actorUserId, parsed, opMeta);
      return { appliedEntity: result.expense as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.UPDATE_EXPENSE: {
      const parsed = updateExpenseSchema.parse({
        ...op.payload,
        ...(op.baseVersion !== null &&
        op.baseVersion !== undefined &&
        op.payload.expectedVersion === undefined
          ? { expectedVersion: op.baseVersion }
          : {}),
      });
      const expense = await updateExpense(shopId, actorUserId, op.entityId, parsed, opMeta);
      return { appliedEntity: expense as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_SUPPLIER: {
      const parsed = createSupplierSchema.parse({
        id: op.entityId,
        ...op.payload,
      });
      const supplier = await createSupplier(shopId, actorUserId, parsed, opMeta);
      return { appliedEntity: supplier as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.UPDATE_SUPPLIER: {
      const parsed = updateSupplierSchema.parse({
        ...op.payload,
        ...(op.baseVersion !== null &&
        op.baseVersion !== undefined &&
        op.payload.expectedVersion === undefined
          ? { expectedVersion: op.baseVersion }
          : {}),
      });
      const supplier = await updateSupplier(shopId, actorUserId, op.entityId, parsed, opMeta);
      return { appliedEntity: supplier as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_PURCHASE: {
      const parsed = createPurchaseSchema.parse({
        id: op.entityId,
        ...op.payload,
      });
      const result = await createPurchase(shopId, actorUserId, parsed, opMeta);
      return { appliedEntity: result.purchase as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_PURCHASE_RETURN: {
      const purchaseId = readRecordString(op.payload, 'purchaseId') ?? op.entityId;
      const sanitized = stripExtraSyncFields(op.payload, ['purchaseId']);
      const parsed = createPurchaseReturnSchema.parse(sanitized);
      const result = await createPurchaseReturn(shopId, actorUserId, purchaseId, parsed, opMeta);
      return { appliedEntity: result.purchase as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_SUPPLIER_PAYMENT: {
      const supplierId = readRecordString(op.payload, 'supplierId');
      if (!supplierId) {
        throw new ValidationError('supplierId is required for CREATE_SUPPLIER_PAYMENT');
      }
      const sanitized = stripExtraSyncFields(op.payload, ['supplierId']);
      const parsed = createSupplierPaymentSchema.parse({
        id: op.entityId,
        ...sanitized,
      });
      const result = await createSupplierPayment(shopId, actorUserId, supplierId, parsed, opMeta);
      return { appliedEntity: result.supplier as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.OPEN_CASHBOOK: {
      const parsed = openCashbookSchema.parse(op.payload);
      const summary = await openCashbookSession(shopId, actorUserId, parsed, opMeta);
      return { appliedEntity: summary as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CLOSE_CASHBOOK: {
      const parsed = closeCashbookSchema.parse(op.payload);
      const summary = await closeCashbookSession(shopId, actorUserId, parsed, opMeta);
      return { appliedEntity: summary as unknown as Record<string, unknown>, warnings: [] };
    }

    case SyncOperationTypes.CREATE_MANUAL_CASHBOOK_ENTRY: {
      const parsed = createManualCashbookEntrySchema.parse({
        id: op.entityId,
        ...op.payload,
      });
      const result = await createManualCashbookEntry(shopId, actorUserId, parsed, opMeta);
      return { appliedEntity: result.entry as unknown as Record<string, unknown>, warnings: [] };
    }
  }
}

async function getLatestShopSyncSeq(shopId: string): Promise<number> {
  const [changeAgg, opAgg] = await Promise.all([
    prisma.syncChange.aggregate({
      where: { shopId },
      _max: { syncSeq: true },
    }),
    prisma.syncOperation.aggregate({
      where: { shopId },
      _max: { syncSeq: true },
    }),
  ]);

  const cSeq = changeAgg._max.syncSeq ? Number(changeAgg._max.syncSeq) : 0;
  const oSeq = opAgg._max.syncSeq ? Number(opAgg._max.syncSeq) : 0;
  return Math.max(cSeq, oSeq);
}

function mapErrorToConflictInfo(err: unknown): {
  resultStatus: 'CONFLICT' | 'ACTION_REQUIRED';
  syncOpStatus: 'CONFLICT' | 'FAILED';
  conflictKind: SyncPushConflictKind;
  conflictMessage: string;
  serverVersion: number | null;
  serverSnapshot: Record<string, unknown> | null;
} {
  if (err instanceof ConflictError) {
    const detailsObj =
      err.details && typeof err.details === 'object' ? err.details : null;
    const rawServerState =
      detailsObj &&
      detailsObj.serverState &&
      typeof detailsObj.serverState === 'object'
        ? (detailsObj.serverState as Record<string, unknown>)
        : detailsObj;

    const serverVersion =
      rawServerState && typeof rawServerState.version === 'number'
        ? rawServerState.version
        : null;

    const conflictKind: SyncPushConflictKind =
      err.code === ErrorCodes.INSUFFICIENT_STOCK ? 'INSUFFICIENT_STOCK' : 'VERSION_CONFLICT';

    return {
      resultStatus: 'CONFLICT',
      syncOpStatus: 'CONFLICT',
      conflictKind,
      conflictMessage: err.message,
      serverVersion,
      serverSnapshot: rawServerState ?? null,
    };
  }

  if (err instanceof AppError) {
    return {
      resultStatus: 'ACTION_REQUIRED',
      syncOpStatus: 'FAILED',
      conflictKind: 'VALIDATION_ERROR',
      conflictMessage: err.message,
      serverVersion: null,
      serverSnapshot:
        err.details && typeof err.details === 'object' ? err.details : null,
    };
  }

  return {
    resultStatus: 'ACTION_REQUIRED',
    syncOpStatus: 'FAILED',
    conflictKind: 'VALIDATION_ERROR',
    conflictMessage: err instanceof Error ? err.message : 'Sync operation failed validation',
    serverVersion: null,
    serverSnapshot: null,
  };
}

export async function pushSyncOperations(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  input: SyncPushInput,
  meta: RequestMeta,
): Promise<SyncPushResponse> {
  const effectiveDeviceId = input.deviceId ?? meta.deviceId ?? 'mobile-device';
  const results: SyncPushOpResultDto[] = [];

  for (const op of input.operations) {
    const existing = await prisma.syncOperation.findUnique({
      where: {
        shopId_idempotencyKey: {
          shopId,
          idempotencyKey: op.idempotencyKey,
        },
      },
    });

    if (existing && existing.status === 'APPLIED') {
      const storedResult =
        existing.resultJson && typeof existing.resultJson === 'object'
          ? (existing.resultJson as Record<string, unknown>)
          : null;
      results.push({
        clientOpId: op.clientOpId,
        idempotencyKey: op.idempotencyKey,
        opType: op.opType,
        entityType: op.entityType,
        entityId: op.entityId,
        status: 'SYNCED',
        syncSeq: Number(existing.syncSeq),
        replayed: true,
        appliedEntity:
          storedResult &&
          storedResult.appliedEntity &&
          typeof storedResult.appliedEntity === 'object'
            ? (storedResult.appliedEntity as Record<string, unknown>)
            : null,
        warnings: [],
      });
      continue;
    }

    try {
      const executed = await executeSyncOperation(shopId, actorUserId, role, op, {
        ...meta,
        deviceId: effectiveDeviceId,
      });

      const recorded = await prisma.syncOperation.upsert({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey: op.idempotencyKey,
          },
        },
        create: {
          shopId,
          actorUserId,
          deviceId: effectiveDeviceId,
          clientOpId: op.clientOpId,
          idempotencyKey: op.idempotencyKey,
          opType: op.opType,
          entityType: op.entityType,
          entityId: op.entityId,
          status: 'APPLIED',
          resultJson: {
            appliedEntity: executed.appliedEntity,
            warnings: executed.warnings,
          } as Prisma.InputJsonValue,
          errorCode: null,
          errorMessage: null,
        },
        update: {
          status: 'APPLIED',
          resultJson: {
            appliedEntity: executed.appliedEntity,
            warnings: executed.warnings,
          } as Prisma.InputJsonValue,
          errorCode: null,
          errorMessage: null,
        },
      });

      results.push({
        clientOpId: op.clientOpId,
        idempotencyKey: op.idempotencyKey,
        opType: op.opType,
        entityType: op.entityType,
        entityId: op.entityId,
        status: 'SYNCED',
        syncSeq: Number(recorded.syncSeq),
        replayed: false,
        appliedEntity: executed.appliedEntity,
        warnings: executed.warnings,
      });
    } catch (err) {
      const conflictInfo = mapErrorToConflictInfo(err);
      const errCode = err instanceof AppError ? err.code : ErrorCodes.VALIDATION_ERROR;

      const recorded = await prisma.syncOperation.upsert({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey: op.idempotencyKey,
          },
        },
        create: {
          shopId,
          actorUserId,
          deviceId: effectiveDeviceId,
          clientOpId: op.clientOpId,
          idempotencyKey: op.idempotencyKey,
          opType: op.opType,
          entityType: op.entityType,
          entityId: op.entityId,
          status: conflictInfo.syncOpStatus,
          errorCode: errCode,
          errorMessage: conflictInfo.conflictMessage.slice(0, 300),
          resultJson: conflictInfo.serverSnapshot
            ? (conflictInfo.serverSnapshot as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
        update: {
          status: conflictInfo.syncOpStatus,
          errorCode: errCode,
          errorMessage: conflictInfo.conflictMessage.slice(0, 300),
          resultJson: conflictInfo.serverSnapshot
            ? (conflictInfo.serverSnapshot as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });

      results.push({
        clientOpId: op.clientOpId,
        idempotencyKey: op.idempotencyKey,
        opType: op.opType,
        entityType: op.entityType,
        entityId: op.entityId,
        status: conflictInfo.resultStatus,
        syncSeq: Number(recorded.syncSeq),
        replayed: false,
        conflictKind: conflictInfo.conflictKind,
        conflictMessage: conflictInfo.conflictMessage,
        serverVersion: conflictInfo.serverVersion,
        serverSnapshot: conflictInfo.serverSnapshot,
      });
    }
  }

  const latestSyncSeq = await getLatestShopSyncSeq(shopId);

  return {
    results,
    latestSyncSeq,
  };
}

export async function pullSyncChanges(
  shopId: string,
  role: UserRole,
  query: SyncPullQuery,
): Promise<SyncPullResponse> {
  const shop = await prisma.shop.findUniqueOrThrow({
    where: { id: shopId },
  });

  const rawRows = await prisma.syncChange.findMany({
    where: {
      shopId,
      syncSeq: { gt: BigInt(query.cursor) },
    },
    orderBy: [{ syncSeq: 'asc' }],
    take: query.limit + 1,
  });

  const hasMore = rawRows.length > query.limit;
  const pageRows = hasMore ? rawRows.slice(0, query.limit) : rawRows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor = lastRow ? Number(lastRow.syncSeq) : query.cursor;

  // Keep highest syncSeq per (entityType, entityId) in order
  const dedupedMap = new Map<string, (typeof pageRows)[number]>();
  for (const row of pageRows) {
    if (
      role === 'EMPLOYEE' &&
      (row.entityType === 'SUPPLIER' || row.entityType === 'PURCHASE')
    ) {
      continue;
    }
    const key = `${row.entityType}:${row.entityId}`;
    if (dedupedMap.has(key)) {
      dedupedMap.delete(key);
    }
    dedupedMap.set(key, row);
  }

  const dedupedRows = Array.from(dedupedMap.values());

  const idsByType = new Map<string, Set<string>>();
  for (const row of dedupedRows) {
    let set = idsByType.get(row.entityType);
    if (!set) {
      set = new Set<string>();
      idsByType.set(row.entityType, set);
    }
    set.add(row.entityId);
  }

  const getIds = (type: string): string[] => Array.from(idsByType.get(type) ?? []);

  const [
    categories,
    units,
    products,
    customers,
    sales,
    suppliers,
    purchases,
    expenseCategories,
    expenses,
    cashbookSessions,
    cashbookEntries,
  ] = await Promise.all([
    getIds('CATEGORY').length > 0
      ? prisma.category.findMany({ where: { shopId, id: { in: getIds('CATEGORY') } } })
      : Promise.resolve([]),
    getIds('UNIT').length > 0
      ? prisma.unit.findMany({ where: { shopId, id: { in: getIds('UNIT') } } })
      : Promise.resolve([]),
    getIds('PRODUCT').length > 0
      ? prisma.product.findMany({
          where: { shopId, id: { in: getIds('PRODUCT') } },
          include: productInclude,
        })
      : Promise.resolve([]),
    getIds('CUSTOMER').length > 0
      ? prisma.customer.findMany({ where: { shopId, id: { in: getIds('CUSTOMER') } } })
      : Promise.resolve([]),
    getIds('SALE').length > 0
      ? prisma.sale.findMany({
          where: { shopId, id: { in: getIds('SALE') } },
          include: saleInclude,
        })
      : Promise.resolve([]),
    getIds('SUPPLIER').length > 0
      ? prisma.supplier.findMany({ where: { shopId, id: { in: getIds('SUPPLIER') } } })
      : Promise.resolve([]),
    getIds('PURCHASE').length > 0
      ? prisma.purchase.findMany({
          where: { shopId, id: { in: getIds('PURCHASE') } },
          include: purchaseInclude,
        })
      : Promise.resolve([]),
    getIds('EXPENSE_CATEGORY').length > 0
      ? prisma.expenseCategory.findMany({
          where: { shopId, id: { in: getIds('EXPENSE_CATEGORY') } },
        })
      : Promise.resolve([]),
    getIds('EXPENSE').length > 0
      ? prisma.expense.findMany({
          where: { shopId, id: { in: getIds('EXPENSE') } },
          include: expenseInclude,
        })
      : Promise.resolve([]),
    getIds('CASHBOOK_SESSION').length > 0
      ? prisma.cashbookSession.findMany({
          where: { shopId, id: { in: getIds('CASHBOOK_SESSION') } },
          select: { id: true, businessDate: true },
        })
      : Promise.resolve([]),
    getIds('CASHBOOK_ENTRY').length > 0
      ? prisma.cashbookEntry.findMany({
          where: { shopId, id: { in: getIds('CASHBOOK_ENTRY') } },
          select: { id: true, occurredAt: true },
        })
      : Promise.resolve([]),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const saleMap = new Map(sales.map((s) => [s.id, s]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const purchaseMap = new Map(purchases.map((p) => [p.id, p]));
  const expenseCatMap = new Map(expenseCategories.map((ec) => [ec.id, ec]));
  const expenseMap = new Map(expenses.map((e) => [e.id, e]));
  const cashbookSessionDateMap = new Map(cashbookSessions.map((s) => [s.id, s.businessDate]));
  const cashbookEntryDateMap = new Map(
    cashbookEntries.map((e) => [e.id, formatDhakaYmd(e.occurredAt)]),
  );

  const uniqueCashbookDates = new Set<string>([
    ...cashbookSessionDateMap.values(),
    ...cashbookEntryDateMap.values(),
  ]);
  const cashbookSummaryByDate = new Map<string, Record<string, unknown>>();
  for (const businessDate of uniqueCashbookDates) {
    const summary = await getCashbookSummary(shopId, businessDate);
    cashbookSummaryByDate.set(businessDate, summary as unknown as Record<string, unknown>);
  }

  const changes: SyncPullChangeDto[] = [];

  for (const row of dedupedRows) {
    const syncSeq = Number(row.syncSeq);
    const occurredAt = row.occurredAt.toISOString();

    if (row.action === 'DELETE') {
      changes.push({
        syncSeq,
        entityType: row.entityType as SyncPullChangeDto['entityType'],
        entityId: row.entityId,
        action: 'DELETE',
        payload: null,
        occurredAt,
      });
      continue;
    }

    switch (row.entityType) {
      case 'CATEGORY': {
        const item = categoryMap.get(row.entityId);
        if (!item) break;
        if (item.deletedAt) {
          changes.push({
            syncSeq,
            entityType: 'CATEGORY',
            entityId: item.id,
            action: 'DELETE',
            payload: null,
            occurredAt,
          });
        } else {
          changes.push({
            syncSeq,
            entityType: 'CATEGORY',
            entityId: item.id,
            action: 'UPSERT',
            payload: {
              id: item.id,
              shopId: item.shopId,
              nameBn: item.nameBn,
              nameEn: item.nameEn,
              sortOrder: item.sortOrder,
              isActive: item.isActive,
              createdAt: item.createdAt.toISOString(),
              updatedAt: item.updatedAt.toISOString(),
            },
            occurredAt,
          });
        }
        break;
      }

      case 'UNIT': {
        const item = unitMap.get(row.entityId);
        if (!item) break;
        changes.push({
          syncSeq,
          entityType: 'UNIT',
          entityId: item.id,
          action: 'UPSERT',
          payload: {
            id: item.id,
            shopId: item.shopId,
            code: item.code,
            nameBn: item.nameBn,
            nameEn: item.nameEn,
            isFractional: item.isFractional,
            isDefault: item.isDefault,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          },
          occurredAt,
        });
        break;
      }

      case 'PRODUCT': {
        const item = productMap.get(row.entityId);
        if (!item) break;
        if (item.deletedAt) {
          changes.push({
            syncSeq,
            entityType: 'PRODUCT',
            entityId: item.id,
            action: 'DELETE',
            payload: null,
            occurredAt,
          });
        } else {
          changes.push({
            syncSeq,
            entityType: 'PRODUCT',
            entityId: item.id,
            action: 'UPSERT',
            payload: toProductDto(item, role) as unknown as Record<string, unknown>,
            occurredAt,
          });
        }
        break;
      }

      case 'CUSTOMER': {
        const item = customerMap.get(row.entityId);
        if (!item) break;
        if (item.deletedAt) {
          changes.push({
            syncSeq,
            entityType: 'CUSTOMER',
            entityId: item.id,
            action: 'DELETE',
            payload: null,
            occurredAt,
          });
        } else {
          changes.push({
            syncSeq,
            entityType: 'CUSTOMER',
            entityId: item.id,
            action: 'UPSERT',
            payload: toCustomerDto(item) as unknown as Record<string, unknown>,
            occurredAt,
          });
        }
        break;
      }

      case 'SALE': {
        const item = saleMap.get(row.entityId);
        if (!item) break;
        changes.push({
          syncSeq,
          entityType: 'SALE',
          entityId: item.id,
          action: 'UPSERT',
          payload: toSaleDto(item, role) as unknown as Record<string, unknown>,
          occurredAt,
        });
        break;
      }

      case 'SUPPLIER': {
        const item = supplierMap.get(row.entityId);
        if (!item) break;
        if (item.deletedAt) {
          changes.push({
            syncSeq,
            entityType: 'SUPPLIER',
            entityId: item.id,
            action: 'DELETE',
            payload: null,
            occurredAt,
          });
        } else {
          changes.push({
            syncSeq,
            entityType: 'SUPPLIER',
            entityId: item.id,
            action: 'UPSERT',
            payload: toSupplierDto(item) as unknown as Record<string, unknown>,
            occurredAt,
          });
        }
        break;
      }

      case 'PURCHASE': {
        const item = purchaseMap.get(row.entityId);
        if (!item) break;
        changes.push({
          syncSeq,
          entityType: 'PURCHASE',
          entityId: item.id,
          action: 'UPSERT',
          payload: toPurchaseDto(item) as unknown as Record<string, unknown>,
          occurredAt,
        });
        break;
      }

      case 'EXPENSE_CATEGORY': {
        const item = expenseCatMap.get(row.entityId);
        if (!item) break;
        if (item.deletedAt) {
          changes.push({
            syncSeq,
            entityType: 'EXPENSE_CATEGORY',
            entityId: item.id,
            action: 'DELETE',
            payload: null,
            occurredAt,
          });
        } else {
          changes.push({
            syncSeq,
            entityType: 'EXPENSE_CATEGORY',
            entityId: item.id,
            action: 'UPSERT',
            payload: toExpenseCategoryDto(item) as unknown as Record<string, unknown>,
            occurredAt,
          });
        }
        break;
      }

      case 'EXPENSE': {
        const item = expenseMap.get(row.entityId);
        if (!item) break;
        changes.push({
          syncSeq,
          entityType: 'EXPENSE',
          entityId: item.id,
          action: 'UPSERT',
          payload: toExpenseDto(item) as unknown as Record<string, unknown>,
          occurredAt,
        });
        break;
      }

      case 'CASHBOOK_SESSION': {
        const bDate = cashbookSessionDateMap.get(row.entityId);
        if (!bDate) break;
        const summaryPayload = cashbookSummaryByDate.get(bDate);
        if (!summaryPayload) break;
        changes.push({
          syncSeq,
          entityType: 'CASHBOOK_SESSION',
          entityId: row.entityId,
          action: 'UPSERT',
          payload: summaryPayload,
          occurredAt,
        });
        break;
      }

      case 'CASHBOOK_ENTRY': {
        const bDate = cashbookEntryDateMap.get(row.entityId);
        if (!bDate) break;
        const summaryPayload = cashbookSummaryByDate.get(bDate);
        if (!summaryPayload) break;
        changes.push({
          syncSeq,
          entityType: 'CASHBOOK_ENTRY',
          entityId: row.entityId,
          action: 'UPSERT',
          payload: summaryPayload,
          occurredAt,
        });
        break;
      }

      default:
        break;
    }
  }

  return {
    cursor: query.cursor,
    nextCursor,
    hasMore,
    serverTime: new Date().toISOString(),
    shop: toShopProfileDto(shop),
    changes,
  };
}
