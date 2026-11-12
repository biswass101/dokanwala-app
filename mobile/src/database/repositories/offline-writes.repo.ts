import {
  addPoisha,
  addQuantities,
  allocatePurchaseNetCostsPoisha,
  calculateDiscountPoisha,
  calculateLineTotalPoisha,
  calculateMovingWacBdt,
  calculateProportionalReturnDiscount,
  compareQuantities,
  convertToBaseQuantity,
  getDhakaYmd,
  subtractQuantities,
  SyncEntityTypes,
  SyncOperationTypes,
  type CashbookMethodTotalsDto,
  type CashbookSummaryResponse,
  type CustomerDto,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type PaymentDto,
  type ProductDto,
  type ProductUnitDto,
  type PurchaseDto,
  type SaleDto,
  type ShopProfileDto,
  type SupplierDto,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import type { CreateStockAdjustmentPayload, CreateProductPayload, UpdateProductPayload, ProductUnitInputPayload } from '@/services/api/catalog';
import type { CreateExpenseCategoryPayload, CreateExpensePayload, UpdateExpensePayload } from '@/services/api/expenses';
import type { CloseCashbookPayload, CreateManualCashbookEntryPayload, OpenCashbookPayload } from '@/services/api/cashbook';
import type {
  CreatePurchasePayload,
  CreatePurchaseReturnPayload,
  CreateSupplierPayload,
  CreateSupplierPaymentPayload,
  UpdateSupplierPayload,
} from '@/services/api/purchases';
import type {
  CancelSalePayload,
  CreateCustomerPayload,
  CreateCustomerPaymentPayload,
  CreateSalePayload,
  CreateSaleReturnPayload,
  UpdateCustomerPayload,
} from '@/services/api/sales';
import { getLocalDatabase } from '../sqlite';
import { loadLocalCashbookSummary } from './cashbook-reports-local.repo';
import {
  loadLocalCategories,
  loadLocalProductById,
  loadLocalUnits,
  removeLocalProductTx,
  writeSingleProductTx,
} from './catalog-local.repo';
import {
  loadLocalExpenseById,
  loadLocalExpenseCategories,
  upsertLocalExpenseCategoryTx,
  upsertLocalExpenseTx,
} from './customers-expenses-local.repo';
import {
  loadLocalPurchaseById,
  loadLocalSupplierById,
  writeSinglePurchaseTx,
  writeSingleSupplierTx,
} from './purchases-local.repo';
import {
  loadLocalCustomerById,
  loadLocalSaleById,
  removeLocalSaleTx,
  writeSingleCustomerTx,
  writeSingleSaleTx,
} from './sales-local.repo';
import { enqueueSyncOperationTx } from './sync-outbox.repo';

export interface OfflineActorContext {
  shopId: string;
  userId: string;
  userName: string;
  shop?: ShopProfileDto | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildOfflineNumber(prefix: string): string {
  const ymd = getDhakaYmd().replace(/-/g, '').slice(2);
  const tail = Crypto.randomUUID().slice(0, 4).toUpperCase();
  return `OFF-${prefix}-${ymd}-${tail}`;
}

export async function createOfflineCustomerWithOutbox(
  ctx: OfflineActorContext,
  payload: CreateCustomerPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<CustomerDto> {
  const db = await getLocalDatabase();
  const id = payload.id ?? Crypto.randomUUID();
  const timestamp = nowIso();
  const customer: CustomerDto = {
    id,
    shopId: ctx.shopId,
    nameBn: payload.nameBn,
    nameEn: payload.nameEn ?? null,
    phone: payload.phone ?? null,
    address: payload.address ?? null,
    note: payload.note ?? null,
    totalPurchasedPoisha: 0,
    totalPaidPoisha: 0,
    duePoisha: 0,
    isActive: true,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.withTransactionAsync(async () => {
    await writeSingleCustomerTx(db, customer);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_CUSTOMER,
      entityType: SyncEntityTypes.CUSTOMER,
      entityId: id,
      payload: {
        nameBn: customer.nameBn,
        ...(customer.nameEn !== null ? { nameEn: customer.nameEn } : {}),
        ...(customer.phone !== null ? { phone: customer.phone } : {}),
        ...(customer.address !== null ? { address: customer.address } : {}),
        ...(customer.note !== null ? { note: customer.note } : {}),
      },
      localSnapshot: customer as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return customer;
}

export async function updateOfflineCustomerWithOutbox(
  ctx: OfflineActorContext,
  customerId: string,
  payload: UpdateCustomerPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<CustomerDto> {
  const existing = await loadLocalCustomerById(customerId);
  if (!existing) {
    throw new Error('Customer not found in local cache');
  }
  const timestamp = nowIso();
  const baseVersion = payload.expectedVersion ?? existing.version;
  const updated: CustomerDto = {
    ...existing,
    ...(payload.nameBn !== undefined ? { nameBn: payload.nameBn } : {}),
    ...(payload.nameEn !== undefined ? { nameEn: payload.nameEn } : {}),
    ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
    ...(payload.address !== undefined ? { address: payload.address } : {}),
    ...(payload.note !== undefined ? { note: payload.note } : {}),
    ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    version: existing.version + 1,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleCustomerTx(db, updated);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.UPDATE_CUSTOMER,
      entityType: SyncEntityTypes.CUSTOMER,
      entityId: customerId,
      baseVersion,
      payload: {
        ...payload,
        expectedVersion: baseVersion,
      },
      localSnapshot: updated as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updated;
}

export async function collectOfflineCustomerPaymentWithOutbox(
  ctx: OfflineActorContext,
  customerId: string,
  payload: CreateCustomerPaymentPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<CustomerDto> {
  const existing = await loadLocalCustomerById(customerId);
  if (!existing) {
    throw new Error('Customer not found in local cache');
  }
  const timestamp = payload.paidAt ?? nowIso();
  const paymentId = payload.id ?? Crypto.randomUUID();
  const nextDue = Math.max(0, existing.duePoisha - payload.amountPoisha);
  const updatedCustomer: CustomerDto = {
    ...existing,
    totalPaidPoisha: addPoisha(existing.totalPaidPoisha, payload.amountPoisha),
    duePoisha: nextDue,
    version: existing.version + 1,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleCustomerTx(db, updatedCustomer);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.COLLECT_CUSTOMER_PAYMENT,
      entityType: SyncEntityTypes.CUSTOMER,
      entityId: paymentId,
      dependsOnEntityId: customerId,
      payload: {
        customerId,
        ...(payload.saleId ? { saleId: payload.saleId } : {}),
        method: payload.method,
        amountPoisha: payload.amountPoisha,
        ...(payload.reference !== undefined ? { reference: payload.reference } : {}),
        ...(payload.note !== undefined ? { note: payload.note } : {}),
        paidAt: timestamp,
      },
      localSnapshot: updatedCustomer as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updatedCustomer;
}

export async function createOfflineSaleWithOutbox(
  ctx: OfflineActorContext,
  payload: CreateSalePayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<SaleDto> {
  const db = await getLocalDatabase();
  const saleId = payload.id ?? Crypto.randomUUID();
  const timestamp = nowIso();

  const updatedProducts: ProductDto[] = [];
  const saleItems: SaleDto['items'] = [];
  const offlineItemPrices: number[] = [];
  let subtotalPoisha = 0;

  for (const item of payload.items) {
    const product = await loadLocalProductById(item.productId);
    if (!product) {
      throw new Error('Product not found in local cache');
    }
    const unitRule = product.units.find((u) => u.unitId === item.unitId);
    if (!unitRule) {
      throw new Error('Selected unit rule missing locally');
    }

    const qtyBase = convertToBaseQuantity(item.qtyDisplay, unitRule.conversionFactorToBase);
    const unitSellingPricePoisha =
      unitRule.sellingPricePoisha ??
      calculateLineTotalPoisha(unitRule.conversionFactorToBase, product.baseSellingPricePoisha);
    const lineSubtotalPoisha = calculateLineTotalPoisha(item.qtyDisplay, unitSellingPricePoisha);
    subtotalPoisha = addPoisha(subtotalPoisha, lineSubtotalPoisha);
    offlineItemPrices.push(unitSellingPricePoisha);

    saleItems.push({
      id: Crypto.randomUUID(),
      saleId,
      productId: product.id,
      unitId: unitRule.unitId,
      productNameBn: product.nameBn,
      productNameEn: product.nameEn,
      unitNameBn: unitRule.unitNameBn,
      unitNameEn: unitRule.unitNameEn,
      qtyDisplay: item.qtyDisplay,
      conversionFactorToBase: unitRule.conversionFactorToBase,
      qtyBase,
      returnedQtyBase: '0.0000',
      unitSellingPricePoisha,
      unitCostAtSaleBdt: null,
      lineSubtotalPoisha,
      lineCogsPoisha: null,
    });

    const alreadyUpdated = updatedProducts.find((p) => p.id === product.id);
    const targetProduct = alreadyUpdated ?? product;
    const nextQtyBase = subtractQuantities(targetProduct.inventory.qtyBase, qtyBase);
    const nextProd: ProductDto = {
      ...targetProduct,
      isLowStock: compareQuantities(nextQtyBase, targetProduct.lowStockThresholdBase) <= 0,
      inventory: {
        ...targetProduct.inventory,
        qtyBase: nextQtyBase,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    };
    if (alreadyUpdated) {
      const idx = updatedProducts.indexOf(alreadyUpdated);
      updatedProducts[idx] = nextProd;
    } else {
      updatedProducts.push(nextProd);
    }
  }

  const discountType = payload.discountType ?? 'FIXED_POISHA';
  const discountValue = String(payload.discountValue ?? '0.00');
  const discountPoisha = calculateDiscountPoisha(subtotalPoisha, discountType, discountValue);
  const totalPoisha = Math.max(0, subtotalPoisha - discountPoisha);

  let paidPoisha = 0;
  let cashPaidPoisha = 0;
  const payments: PaymentDto[] = (payload.payments ?? []).map((p) => {
    paidPoisha = addPoisha(paidPoisha, p.amountPoisha);
    if (p.method === 'CASH') {
      cashPaidPoisha = addPoisha(cashPaidPoisha, p.amountPoisha);
    }
    return {
      id: Crypto.randomUUID(),
      saleId,
      method: p.method,
      amountPoisha: p.amountPoisha,
      reference: p.reference ?? null,
      receivedAt: timestamp,
    };
  });

  const duePoisha = Math.max(0, totalPoisha - paidPoisha);
  const changePoisha =
    payload.tenderedPoisha !== undefined && payload.tenderedPoisha !== null
      ? Math.max(0, payload.tenderedPoisha - cashPaidPoisha)
      : 0;

  let updatedCustomer: CustomerDto | null = null;
  if (payload.customerId) {
    const existingCustomer = await loadLocalCustomerById(payload.customerId);
    if (existingCustomer) {
      updatedCustomer = {
        ...existingCustomer,
        totalPurchasedPoisha: addPoisha(existingCustomer.totalPurchasedPoisha, totalPoisha),
        totalPaidPoisha: addPoisha(existingCustomer.totalPaidPoisha, paidPoisha),
        duePoisha: addPoisha(existingCustomer.duePoisha, duePoisha),
        version: existingCustomer.version + 1,
        updatedAt: timestamp,
      };
    }
  }

  const sale: SaleDto = {
    id: saleId,
    shopId: ctx.shopId,
    receiptNumber: buildOfflineNumber('INV'),
    customerId: payload.customerId ?? null,
    customerNameSnapshot: updatedCustomer?.nameBn ?? null,
    status: 'COMPLETED',
    subtotalPoisha,
    discountType,
    discountValue,
    discountPoisha,
    totalPoisha,
    paidPoisha,
    settledDuePoisha: 0,
    duePoisha,
    tenderedPoisha: payload.tenderedPoisha ?? null,
    changePoisha,
    returnedTotalPoisha: 0,
    cashRefundedPoisha: 0,
    cogsPoisha: null,
    estimatedProfitPoisha: null,
    note: payload.note ?? null,
    actorUserId: ctx.userId,
    actorName: ctx.userName,
    cancelledAt: null,
    cancelReason: null,
    soldAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    items: saleItems,
    payments,
    returns: [],
  };

  await db.withTransactionAsync(async () => {
    await writeSingleSaleTx(db, sale);
    for (const prod of updatedProducts) {
      await writeSingleProductTx(db, prod);
    }
    if (updatedCustomer) {
      await writeSingleCustomerTx(db, updatedCustomer);
    }
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_SALE,
      entityType: SyncEntityTypes.SALE,
      entityId: saleId,
      dependsOnEntityId: payload.customerId ?? null,
      payload: {
        ...payload,
        offlineItemPrices,
      },
      localSnapshot: sale as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return sale;
}

export async function createOfflineSaleReturnWithOutbox(
  ctx: OfflineActorContext,
  saleId: string,
  payload: CreateSaleReturnPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<SaleDto> {
  const existing = await loadLocalSaleById(saleId);
  if (!existing) {
    throw new Error('Sale not found in local cache');
  }
  const timestamp = nowIso();
  let returnSubtotalPoisha = 0;

  const updatedProducts: ProductDto[] = [];
  const returnItems: SaleDto['returns'][number]['items'] = [];
  const returnId = Crypto.randomUUID();
  const returnDeltaByItem = new Map<string, string>();

  for (const reqItem of payload.items) {
    const saleItem = existing.items.find((i) => i.id === reqItem.saleItemId);
    if (!saleItem) {
      throw new Error('Sale item not found locally');
    }
    const qtyBase = convertToBaseQuantity(reqItem.qtyDisplay, saleItem.conversionFactorToBase);
    const lineRefund = calculateLineTotalPoisha(reqItem.qtyDisplay, saleItem.unitSellingPricePoisha);
    returnSubtotalPoisha = addPoisha(returnSubtotalPoisha, lineRefund);
    returnDeltaByItem.set(saleItem.id, qtyBase);

    returnItems.push({
      id: Crypto.randomUUID(),
      saleReturnId: returnId,
      saleItemId: saleItem.id,
      productId: saleItem.productId,
      productNameBn: saleItem.productNameBn,
      productNameEn: saleItem.productNameEn,
      unitNameBn: saleItem.unitNameBn,
      unitNameEn: saleItem.unitNameEn,
      qtyDisplay: reqItem.qtyDisplay,
      qtyBase,
      unitSellingPricePoisha: saleItem.unitSellingPricePoisha,
      lineRefundPoisha: lineRefund,
      restoredCogsPoisha: 0,
    });

    const prod = await loadLocalProductById(saleItem.productId);
    if (prod) {
      const nextQty = addQuantities(prod.inventory.qtyBase, qtyBase);
      updatedProducts.push({
        ...prod,
        isLowStock: compareQuantities(nextQty, prod.lowStockThresholdBase) <= 0,
        inventory: { ...prod.inventory, qtyBase: nextQty, updatedAt: timestamp },
        updatedAt: timestamp,
      });
    }
  }

  const nextItems = existing.items.map((it) => {
    const delta = returnDeltaByItem.get(it.id);
    if (!delta) return it;
    return {
      ...it,
      returnedQtyBase: addQuantities(it.returnedQtyBase, delta),
    };
  });

  const isFullRemaining = nextItems.every(
    (it) => compareQuantities(it.returnedQtyBase, it.qtyBase) === 0,
  );
  const alreadyAdj = existing.returns.reduce((sum, r) => sum + r.discountAdjustmentPoisha, 0);
  const discountAdj = calculateProportionalReturnDiscount({
    returnSubtotalPoisha,
    saleSubtotalPoisha: existing.subtotalPoisha,
    totalDiscountPoisha: existing.discountPoisha,
    alreadyDiscountAdjustedPoisha: alreadyAdj,
    isFullRemainingReturn: isFullRemaining,
  });
  const refundTotalPoisha = Math.max(0, returnSubtotalPoisha - discountAdj);
  const cashRefundPoisha =
    payload.refundMethod === 'CREDIT_ADJUSTMENT'
      ? 0
      : Math.min(
          refundTotalPoisha,
          Math.max(0, existing.paidPoisha + existing.settledDuePoisha - existing.cashRefundedPoisha),
        );
  const creditAdjustedPoisha = refundTotalPoisha - cashRefundPoisha;

  const updatedSale: SaleDto = {
    ...existing,
    status: isFullRemaining ? 'RETURNED' : 'PARTIALLY_RETURNED',
    returnedTotalPoisha: addPoisha(existing.returnedTotalPoisha, refundTotalPoisha),
    duePoisha: Math.max(0, existing.duePoisha - creditAdjustedPoisha),
    cashRefundedPoisha: addPoisha(existing.cashRefundedPoisha, cashRefundPoisha),
    updatedAt: timestamp,
    items: nextItems,
    returns: [
      ...existing.returns,
      {
        id: returnId,
        saleId: existing.id,
        returnNumber: buildOfflineNumber('RET'),
        refundMethod: payload.refundMethod,
        subtotalPoisha: returnSubtotalPoisha,
        discountAdjustmentPoisha: discountAdj,
        refundTotalPoisha,
        cashRefundPoisha,
        creditAdjustedPoisha,
        reason: payload.reason ?? null,
        actorUserId: ctx.userId,
        actorName: ctx.userName,
        returnedAt: timestamp,
        items: returnItems,
      },
    ],
  };

  let updatedCustomer: CustomerDto | null = null;
  if (existing.customerId) {
    const cust = await loadLocalCustomerById(existing.customerId);
    if (cust) {
      updatedCustomer = {
        ...cust,
        totalPurchasedPoisha: Math.max(0, cust.totalPurchasedPoisha - refundTotalPoisha),
        totalPaidPoisha: Math.max(0, cust.totalPaidPoisha - cashRefundPoisha),
        duePoisha: Math.max(0, cust.duePoisha - creditAdjustedPoisha),
        updatedAt: timestamp,
      };
    }
  }

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleSaleTx(db, updatedSale);
    for (const p of updatedProducts) {
      await writeSingleProductTx(db, p);
    }
    if (updatedCustomer) {
      await writeSingleCustomerTx(db, updatedCustomer);
    }
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_SALE_RETURN,
      entityType: SyncEntityTypes.SALE,
      entityId: returnId,
      dependsOnEntityId: saleId,
      payload: {
        saleId,
        ...payload,
      },
      localSnapshot: updatedSale as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updatedSale;
}

export async function cancelOfflineSaleWithOutbox(
  ctx: OfflineActorContext,
  saleId: string,
  payload: CancelSalePayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<SaleDto> {
  const existing = await loadLocalSaleById(saleId);
  if (!existing) {
    throw new Error('Sale not found in local cache');
  }
  const timestamp = nowIso();
  const updatedProducts: ProductDto[] = [];
  for (const item of existing.items) {
    const prod = await loadLocalProductById(item.productId);
    if (prod) {
      const nextQty = addQuantities(prod.inventory.qtyBase, item.qtyBase);
      updatedProducts.push({
        ...prod,
        isLowStock: compareQuantities(nextQty, prod.lowStockThresholdBase) <= 0,
        inventory: { ...prod.inventory, qtyBase: nextQty, updatedAt: timestamp },
        updatedAt: timestamp,
      });
    }
  }

  let updatedCustomer: CustomerDto | null = null;
  if (existing.customerId) {
    const cust = await loadLocalCustomerById(existing.customerId);
    if (cust) {
      updatedCustomer = {
        ...cust,
        totalPurchasedPoisha: Math.max(0, cust.totalPurchasedPoisha - existing.totalPoisha),
        totalPaidPoisha: Math.max(0, cust.totalPaidPoisha - existing.paidPoisha),
        duePoisha: Math.max(0, cust.duePoisha - existing.duePoisha),
        updatedAt: timestamp,
      };
    }
  }

  const cancelledSale: SaleDto = {
    ...existing,
    status: 'CANCELLED',
    duePoisha: 0,
    cancelledAt: timestamp,
    cancelReason: payload.reason,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleSaleTx(db, cancelledSale);
    for (const p of updatedProducts) {
      await writeSingleProductTx(db, p);
    }
    if (updatedCustomer) {
      await writeSingleCustomerTx(db, updatedCustomer);
    }
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CANCEL_SALE,
      entityType: SyncEntityTypes.SALE,
      entityId: saleId,
      dependsOnEntityId: saleId,
      payload: {
        saleId,
        reason: payload.reason,
      },
      localSnapshot: cancelledSale as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return cancelledSale;
}

export async function createOfflineProductWithOutbox(
  ctx: OfflineActorContext,
  payload: CreateProductPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<ProductDto> {
  const id = payload.id ?? Crypto.randomUUID();
  const timestamp = nowIso();
  const [categories, units] = await Promise.all([
    loadLocalCategories(ctx.shopId, true),
    loadLocalUnits(ctx.shopId),
  ]);
  const category = payload.categoryId
    ? categories.find((c) => c.id === payload.categoryId) ?? null
    : null;
  const baseUnit = units.find((u) => u.id === payload.baseUnitId);
  const unitMap = new Map(units.map((u) => [u.id, u]));

  const defaultSaleUnitId = payload.defaultSaleUnitId ?? payload.baseUnitId;
  const defaultPurchaseUnitId = payload.defaultPurchaseUnitId ?? payload.baseUnitId;

  const productUnits: ProductUnitDto[] = [
    {
      id: Crypto.randomUUID(),
      productId: id,
      unitId: payload.baseUnitId,
      unitCode: baseUnit?.code ?? 'pcs',
      unitNameBn: baseUnit?.nameBn ?? 'পিস',
      unitNameEn: baseUnit?.nameEn ?? 'Pcs',
      isFractional: baseUnit?.isFractional ?? false,
      conversionFactorToBase: '1.0000',
      sellingPricePoisha: payload.baseSellingPricePoisha,
      isBaseUnit: true,
      isDefaultSaleUnit: defaultSaleUnitId === payload.baseUnitId,
      isDefaultPurchaseUnit: defaultPurchaseUnitId === payload.baseUnitId,
    },
  ];

  for (const extra of payload.units ?? []) {
    if (extra.unitId === payload.baseUnitId) continue;
    const u = unitMap.get(extra.unitId);
    productUnits.push({
      id: Crypto.randomUUID(),
      productId: id,
      unitId: extra.unitId,
      unitCode: u?.code ?? 'unit',
      unitNameBn: u?.nameBn ?? 'ইউনিট',
      unitNameEn: u?.nameEn ?? 'Unit',
      isFractional: u?.isFractional ?? false,
      conversionFactorToBase: extra.conversionFactorToBase,
      sellingPricePoisha: extra.sellingPricePoisha ?? null,
      isBaseUnit: false,
      isDefaultSaleUnit: defaultSaleUnitId === extra.unitId,
      isDefaultPurchaseUnit: defaultPurchaseUnitId === extra.unitId,
    });
  }

  let qtyBase = '0.0000';
  if (payload.openingStock) {
    const uRule = productUnits.find((pu) => pu.unitId === payload.openingStock?.unitId);
    qtyBase = convertToBaseQuantity(
      payload.openingStock.qtyDisplay,
      uRule?.conversionFactorToBase ?? '1.0000',
    );
  }
  const thresholdBase = payload.lowStockThresholdBase ?? '0.0000';

  const product: ProductDto = {
    id,
    shopId: ctx.shopId,
    categoryId: category?.id ?? payload.categoryId ?? null,
    categoryNameBn: category?.nameBn ?? null,
    categoryNameEn: category?.nameEn ?? null,
    nameBn: payload.nameBn,
    nameEn: payload.nameEn ?? null,
    barcode: payload.barcode ?? null,
    imageUrl: null,
    defaultSupplierName: payload.defaultSupplierName ?? null,
    baseUnitId: payload.baseUnitId,
    baseUnitCode: baseUnit?.code ?? 'pcs',
    baseUnitNameBn: baseUnit?.nameBn ?? 'পিস',
    baseUnitNameEn: baseUnit?.nameEn ?? 'Pcs',
    defaultSaleUnitId,
    defaultPurchaseUnitId,
    baseSellingPricePoisha: payload.baseSellingPricePoisha,
    lastPurchasePricePoisha: payload.lastPurchasePricePoisha ?? 0,
    lowStockThresholdBase: thresholdBase,
    isLowStock: compareQuantities(qtyBase, thresholdBase) <= 0,
    isActive: true,
    version: 1,
    units: productUnits,
    inventory: {
      productId: id,
      qtyBase,
      avgCostPerBaseBdt: null,
      valuationPoisha: null,
      version: 1,
      updatedAt: timestamp,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleProductTx(db, product);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_PRODUCT,
      entityType: SyncEntityTypes.PRODUCT,
      entityId: id,
      payload: payload as unknown as Record<string, unknown>,
      localSnapshot: product as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return product;
}

export async function updateOfflineProductWithOutbox(
  ctx: OfflineActorContext,
  productId: string,
  patch: UpdateProductPayload,
  _units?: ProductUnitInputPayload[],
  idempotencyKey = Crypto.randomUUID(),
): Promise<ProductDto> {
  const existing = await loadLocalProductById(productId);
  if (!existing) {
    throw new Error('Product not found in local cache');
  }
  const timestamp = nowIso();
  const baseVersion = patch.expectedVersion ?? existing.version;
  const nextThreshold = patch.lowStockThresholdBase ?? existing.lowStockThresholdBase;

  const updated: ProductDto = {
    ...existing,
    ...(patch.nameBn !== undefined ? { nameBn: patch.nameBn } : {}),
    ...(patch.nameEn !== undefined ? { nameEn: patch.nameEn } : {}),
    ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
    ...(patch.barcode !== undefined ? { barcode: patch.barcode } : {}),
    ...(patch.defaultSupplierName !== undefined
      ? { defaultSupplierName: patch.defaultSupplierName }
      : {}),
    ...(patch.baseSellingPricePoisha !== undefined
      ? { baseSellingPricePoisha: patch.baseSellingPricePoisha }
      : {}),
    ...(patch.lastPurchasePricePoisha !== undefined
      ? { lastPurchasePricePoisha: patch.lastPurchasePricePoisha }
      : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    lowStockThresholdBase: nextThreshold,
    isLowStock: compareQuantities(existing.inventory.qtyBase, nextThreshold) <= 0,
    version: existing.version + 1,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleProductTx(db, updated);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.UPDATE_PRODUCT,
      entityType: SyncEntityTypes.PRODUCT,
      entityId: productId,
      baseVersion,
      payload: {
        ...patch,
        expectedVersion: baseVersion,
      },
      localSnapshot: updated as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updated;
}

export async function archiveOfflineProductWithOutbox(
  ctx: OfflineActorContext,
  productId: string,
  idempotencyKey = Crypto.randomUUID(),
): Promise<void> {
  const db = await getLocalDatabase();
  const timestamp = nowIso();
  await db.withTransactionAsync(async () => {
    await removeLocalProductTx(db, productId);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.ARCHIVE_PRODUCT,
      entityType: SyncEntityTypes.PRODUCT,
      entityId: productId,
      payload: {},
      occurredAt: timestamp,
    });
  });
}

export async function createOfflineStockAdjustmentWithOutbox(
  ctx: OfflineActorContext,
  payload: CreateStockAdjustmentPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<ProductDto> {
  const existing = await loadLocalProductById(payload.productId);
  if (!existing) {
    throw new Error('Product not found in local cache');
  }
  const timestamp = nowIso();
  const unitRule = existing.units.find((u) => u.unitId === payload.unitId);
  const factor = unitRule?.conversionFactorToBase ?? '1.0000';

  let nextQtyBase = existing.inventory.qtyBase;
  if (payload.adjustmentType === 'COUNT_ADJUST' && payload.countedQtyDisplay !== undefined) {
    nextQtyBase = convertToBaseQuantity(payload.countedQtyDisplay, factor);
  } else if (payload.qtyDisplay !== undefined) {
    const deltaBase = convertToBaseQuantity(payload.qtyDisplay, factor);
    nextQtyBase =
      payload.adjustmentType === 'COUNT_ADJUST' && payload.direction === 'INCREASE'
        ? addQuantities(existing.inventory.qtyBase, deltaBase)
        : subtractQuantities(existing.inventory.qtyBase, deltaBase);
  }

  const updated: ProductDto = {
    ...existing,
    isLowStock: compareQuantities(nextQtyBase, existing.lowStockThresholdBase) <= 0,
    inventory: {
      ...existing.inventory,
      qtyBase: nextQtyBase,
      updatedAt: timestamp,
    },
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleProductTx(db, updated);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_STOCK_ADJUSTMENT,
      entityType: SyncEntityTypes.PRODUCT,
      entityId: payload.productId,
      dependsOnEntityId: payload.productId,
      payload: payload as unknown as Record<string, unknown>,
      localSnapshot: updated as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updated;
}

export async function createOfflineExpenseCategoryWithOutbox(
  ctx: OfflineActorContext,
  payload: CreateExpenseCategoryPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<ExpenseCategoryDto> {
  const id = payload.id ?? Crypto.randomUUID();
  const timestamp = nowIso();
  const cat: ExpenseCategoryDto = {
    id,
    shopId: ctx.shopId,
    nameBn: payload.nameBn,
    nameEn: payload.nameEn ?? null,
    isDefault: false,
    sortOrder: payload.sortOrder ?? 100,
    isActive: true,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await upsertLocalExpenseCategoryTx(db, cat);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_EXPENSE_CATEGORY,
      entityType: SyncEntityTypes.EXPENSE_CATEGORY,
      entityId: id,
      payload: {
        nameBn: cat.nameBn,
        ...(cat.nameEn !== null ? { nameEn: cat.nameEn } : {}),
        sortOrder: cat.sortOrder,
      },
      localSnapshot: cat as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return cat;
}

export async function createOfflineExpenseWithOutbox(
  ctx: OfflineActorContext,
  payload: CreateExpensePayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<ExpenseDto> {
  const id = payload.id ?? Crypto.randomUUID();
  const timestamp = payload.incurredAt ?? nowIso();
  const categories = await loadLocalExpenseCategories(ctx.shopId);
  const cat = categories.find((c) => c.id === payload.categoryId);

  const expense: ExpenseDto = {
    id,
    shopId: ctx.shopId,
    categoryId: payload.categoryId,
    categoryNameBn: cat?.nameBn ?? 'খরচ',
    categoryNameEn: cat?.nameEn ?? null,
    amountPoisha: payload.amountPoisha,
    method: payload.method,
    reference: payload.reference ?? null,
    note: payload.note ?? null,
    incurredAt: timestamp,
    actorUserId: ctx.userId,
    actorName: ctx.userName,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await upsertLocalExpenseTx(db, expense);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_EXPENSE,
      entityType: SyncEntityTypes.EXPENSE,
      entityId: id,
      dependsOnEntityId: payload.categoryId,
      payload: {
        ...payload,
        incurredAt: timestamp,
      },
      localSnapshot: expense as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return expense;
}

export async function updateOfflineExpenseWithOutbox(
  ctx: OfflineActorContext,
  expenseId: string,
  payload: UpdateExpensePayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<ExpenseDto> {
  const existing = await loadLocalExpenseById(expenseId);
  if (!existing) {
    throw new Error('Expense not found in local cache');
  }
  const timestamp = nowIso();
  const baseVersion = payload.expectedVersion ?? existing.version;
  const updated: ExpenseDto = {
    ...existing,
    ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
    ...(payload.amountPoisha !== undefined ? { amountPoisha: payload.amountPoisha } : {}),
    ...(payload.method !== undefined ? { method: payload.method } : {}),
    ...(payload.reference !== undefined ? { reference: payload.reference } : {}),
    ...(payload.note !== undefined ? { note: payload.note } : {}),
    ...(payload.incurredAt !== undefined ? { incurredAt: payload.incurredAt } : {}),
    version: existing.version + 1,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await upsertLocalExpenseTx(db, updated);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.UPDATE_EXPENSE,
      entityType: SyncEntityTypes.EXPENSE,
      entityId: expenseId,
      baseVersion,
      payload: {
        ...payload,
        expectedVersion: baseVersion,
      },
      localSnapshot: updated as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updated;
}

export async function createOfflineSupplierWithOutbox(
  ctx: OfflineActorContext,
  payload: CreateSupplierPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<SupplierDto> {
  const id = payload.id ?? Crypto.randomUUID();
  const timestamp = nowIso();
  const supplier: SupplierDto = {
    id,
    shopId: ctx.shopId,
    nameBn: payload.nameBn,
    nameEn: payload.nameEn ?? null,
    phone: payload.phone ?? null,
    address: payload.address ?? null,
    note: payload.note ?? null,
    totalPurchasedPoisha: 0,
    totalPaidPoisha: 0,
    payablePoisha: 0,
    isActive: true,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleSupplierTx(db, supplier);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_SUPPLIER,
      entityType: SyncEntityTypes.SUPPLIER,
      entityId: id,
      payload: {
        nameBn: supplier.nameBn,
        ...(supplier.nameEn !== null ? { nameEn: supplier.nameEn } : {}),
        ...(supplier.phone !== null ? { phone: supplier.phone } : {}),
        ...(supplier.address !== null ? { address: supplier.address } : {}),
        ...(supplier.note !== null ? { note: supplier.note } : {}),
      },
      localSnapshot: supplier as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return supplier;
}

export async function updateOfflineSupplierWithOutbox(
  ctx: OfflineActorContext,
  supplierId: string,
  payload: UpdateSupplierPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<SupplierDto> {
  const existing = await loadLocalSupplierById(supplierId);
  if (!existing) {
    throw new Error('Supplier not found in local cache');
  }
  const timestamp = nowIso();
  const baseVersion = payload.expectedVersion ?? existing.version;
  const updated: SupplierDto = {
    ...existing,
    ...(payload.nameBn !== undefined ? { nameBn: payload.nameBn } : {}),
    ...(payload.nameEn !== undefined ? { nameEn: payload.nameEn } : {}),
    ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
    ...(payload.address !== undefined ? { address: payload.address } : {}),
    ...(payload.note !== undefined ? { note: payload.note } : {}),
    ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    version: existing.version + 1,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleSupplierTx(db, updated);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.UPDATE_SUPPLIER,
      entityType: SyncEntityTypes.SUPPLIER,
      entityId: supplierId,
      baseVersion,
      payload: {
        ...payload,
        expectedVersion: baseVersion,
      },
      localSnapshot: updated as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updated;
}

export async function createOfflineSupplierPaymentWithOutbox(
  ctx: OfflineActorContext,
  supplierId: string,
  payload: CreateSupplierPaymentPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<SupplierDto> {
  const existing = await loadLocalSupplierById(supplierId);
  if (!existing) {
    throw new Error('Supplier not found in local cache');
  }
  const timestamp = nowIso();
  const paymentId = payload.id ?? Crypto.randomUUID();
  const updatedSupplier: SupplierDto = {
    ...existing,
    totalPaidPoisha: addPoisha(existing.totalPaidPoisha, payload.amountPoisha),
    payablePoisha: Math.max(0, existing.payablePoisha - payload.amountPoisha),
    version: existing.version + 1,
    updatedAt: timestamp,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleSupplierTx(db, updatedSupplier);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_SUPPLIER_PAYMENT,
      entityType: SyncEntityTypes.SUPPLIER,
      entityId: paymentId,
      dependsOnEntityId: supplierId,
      payload: {
        supplierId,
        ...(payload.purchaseId ? { purchaseId: payload.purchaseId } : {}),
        method: payload.method,
        amountPoisha: payload.amountPoisha,
        ...(payload.reference !== undefined ? { reference: payload.reference } : {}),
        ...(payload.note !== undefined ? { note: payload.note } : {}),
        paidAt: timestamp,
      },
      localSnapshot: updatedSupplier as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updatedSupplier;
}

export async function createOfflinePurchaseWithOutbox(
  ctx: OfflineActorContext,
  payload: CreatePurchasePayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<PurchaseDto> {
  const purchaseId = payload.id ?? Crypto.randomUUID();
  const timestamp = nowIso();
  const rawLines: {
    lineOrder: number;
    product: ProductDto;
    unitRule: ProductUnitDto;
    qtyDisplay: string;
    qtyBase: string;
    unitCostPoisha: number;
    lineTotalPoisha: number;
  }[] = [];

  let subtotalPoisha = 0;
  for (let i = 0; i < payload.items.length; i += 1) {
    const it = payload.items[i];
    if (!it) continue;
    const prod = await loadLocalProductById(it.productId);
    if (!prod) {
      throw new Error('Product not found in local cache');
    }
    const unitRule = prod.units.find((u) => u.unitId === it.unitId);
    if (!unitRule) {
      throw new Error('Selected unit rule missing locally');
    }
    const qtyBase = convertToBaseQuantity(it.qtyDisplay, unitRule.conversionFactorToBase);
    const lineTotal = calculateLineTotalPoisha(it.qtyDisplay, it.unitCostPoisha);
    subtotalPoisha = addPoisha(subtotalPoisha, lineTotal);
    rawLines.push({
      lineOrder: i,
      product: prod,
      unitRule,
      qtyDisplay: it.qtyDisplay,
      qtyBase,
      unitCostPoisha: it.unitCostPoisha,
      lineTotalPoisha: lineTotal,
    });
  }

  const discountPoisha = payload.discountPoisha ?? 0;
  const netCosts = allocatePurchaseNetCostsPoisha(
    rawLines.map((l) => l.lineTotalPoisha),
    discountPoisha,
  );
  const totalPoisha = Math.max(0, subtotalPoisha - discountPoisha);
  const paidPoisha = payload.paidPoisha ?? 0;
  const duePoisha = Math.max(0, totalPoisha - paidPoisha);

  const updatedProducts: ProductDto[] = [];
  const purchaseItems: PurchaseDto['items'] = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (!line) continue;
    const netCost = netCosts[i] ?? line.lineTotalPoisha;
    purchaseItems.push({
      id: Crypto.randomUUID(),
      purchaseId,
      productId: line.product.id,
      unitId: line.unitRule.unitId,
      productNameBn: line.product.nameBn,
      productNameEn: line.product.nameEn,
      unitNameBn: line.unitRule.unitNameBn,
      unitNameEn: line.unitRule.unitNameEn,
      lineOrder: line.lineOrder,
      qtyDisplay: line.qtyDisplay,
      conversionFactorToBase: line.unitRule.conversionFactorToBase,
      qtyBase: line.qtyBase,
      returnedQtyBase: '0.0000',
      unitCostPoisha: line.unitCostPoisha,
      lineTotalPoisha: line.lineTotalPoisha,
      netCostPoisha: netCost,
    });

    const curProd = updatedProducts.find((p) => p.id === line.product.id) ?? line.product;
    const nextQty = addQuantities(curProd.inventory.qtyBase, line.qtyBase);
    const nextAvgWac = curProd.inventory.avgCostPerBaseBdt
      ? calculateMovingWacBdt({
          oldQtyBase: curProd.inventory.qtyBase,
          oldAvgCostBdt: curProd.inventory.avgCostPerBaseBdt,
          incomingQtyBase: line.qtyBase,
          incomingTotalCostPoisha: netCost,
        })
      : null;

    const nextProd: ProductDto = {
      ...curProd,
      isLowStock: compareQuantities(nextQty, curProd.lowStockThresholdBase) <= 0,
      inventory: {
        ...curProd.inventory,
        qtyBase: nextQty,
        avgCostPerBaseBdt: nextAvgWac,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    };
    const idx = updatedProducts.findIndex((p) => p.id === curProd.id);
    if (idx >= 0) updatedProducts[idx] = nextProd;
    else updatedProducts.push(nextProd);
  }

  let updatedSupplier: SupplierDto | null = null;
  if (payload.supplierId) {
    const sup = await loadLocalSupplierById(payload.supplierId);
    if (sup) {
      updatedSupplier = {
        ...sup,
        totalPurchasedPoisha: addPoisha(sup.totalPurchasedPoisha, totalPoisha),
        totalPaidPoisha: addPoisha(sup.totalPaidPoisha, paidPoisha),
        payablePoisha: addPoisha(sup.payablePoisha, duePoisha),
        version: sup.version + 1,
        updatedAt: timestamp,
      };
    }
  }

  const purchase: PurchaseDto = {
    id: purchaseId,
    shopId: ctx.shopId,
    purchaseNumber: buildOfflineNumber('PUR'),
    supplierId: payload.supplierId ?? null,
    supplierNameSnapshot: updatedSupplier?.nameBn ?? null,
    status: 'COMPLETED',
    subtotalPoisha,
    discountPoisha,
    totalPoisha,
    paidPoisha,
    settledDuePoisha: 0,
    duePoisha,
    paymentMethod: paidPoisha > 0 ? (payload.paymentMethod ?? null) : null,
    paymentReference: paidPoisha > 0 ? (payload.paymentReference ?? null) : null,
    returnedTotalPoisha: 0,
    cashRefundedPoisha: 0,
    note: payload.note ?? null,
    actorUserId: ctx.userId,
    actorName: ctx.userName,
    purchasedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    items: purchaseItems,
    returns: [],
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSinglePurchaseTx(db, purchase);
    for (const p of updatedProducts) {
      await writeSingleProductTx(db, p);
    }
    if (updatedSupplier) {
      await writeSingleSupplierTx(db, updatedSupplier);
    }
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_PURCHASE,
      entityType: SyncEntityTypes.PURCHASE,
      entityId: purchaseId,
      dependsOnEntityId: payload.supplierId ?? null,
      payload: {
        ...payload,
        purchasedAt: timestamp,
      },
      localSnapshot: purchase as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return purchase;
}

export async function createOfflinePurchaseReturnWithOutbox(
  ctx: OfflineActorContext,
  purchaseId: string,
  payload: CreatePurchaseReturnPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<PurchaseDto> {
  const existing = await loadLocalPurchaseById(purchaseId);
  if (!existing) {
    throw new Error('Purchase not found in local cache');
  }
  const timestamp = nowIso();
  const returnId = Crypto.randomUUID();
  const returnDeltaByItem = new Map<string, string>();
  let returnSubtotal = 0;

  for (const reqItem of payload.items) {
    const it = existing.items.find((p) => p.id === reqItem.purchaseItemId);
    if (!it) throw new Error('Purchase item missing locally');
    const qtyBase = convertToBaseQuantity(reqItem.qtyDisplay, it.conversionFactorToBase);
    returnDeltaByItem.set(it.id, qtyBase);
    returnSubtotal = addPoisha(
      returnSubtotal,
      calculateLineTotalPoisha(reqItem.qtyDisplay, it.unitCostPoisha),
    );
  }

  const nextItems = existing.items.map((it) => {
    const d = returnDeltaByItem.get(it.id);
    if (!d) return it;
    return { ...it, returnedQtyBase: addQuantities(it.returnedQtyBase, d) };
  });
  const isFull = nextItems.every((it) => compareQuantities(it.returnedQtyBase, it.qtyBase) === 0);
  const updated: PurchaseDto = {
    ...existing,
    status: isFull ? 'RETURNED' : 'PARTIALLY_RETURNED',
    returnedTotalPoisha: addPoisha(existing.returnedTotalPoisha, returnSubtotal),
    updatedAt: timestamp,
    items: nextItems,
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSinglePurchaseTx(db, updated);
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_PURCHASE_RETURN,
      entityType: SyncEntityTypes.PURCHASE,
      entityId: returnId,
      dependsOnEntityId: purchaseId,
      payload: {
        purchaseId,
        ...payload,
      },
      localSnapshot: updated as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return updated;
}

function createEmptyCashbookTotals(): CashbookMethodTotalsDto {
  return {
    cashInPoisha: 0,
    cashOutPoisha: 0,
    netCashPoisha: 0,
    bkashInPoisha: 0,
    bkashOutPoisha: 0,
    netBkashPoisha: 0,
    nagadInPoisha: 0,
    nagadOutPoisha: 0,
    netNagadPoisha: 0,
    otherInPoisha: 0,
    otherOutPoisha: 0,
    netOtherPoisha: 0,
    totalInPoisha: 0,
    totalOutPoisha: 0,
    netAllMethodsPoisha: 0,
  };
}

export async function openOfflineCashbookWithOutbox(
  ctx: OfflineActorContext,
  businessDate: string,
  payload: OpenCashbookPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<CashbookSummaryResponse> {
  const existing = await loadLocalCashbookSummary(ctx.shopId, businessDate);
  const timestamp = nowIso();
  const sessionId = existing?.session?.id ?? Crypto.randomUUID();
  const netCash = existing?.totals.netCashPoisha ?? 0;
  const expectedClosing = payload.openingCashPoisha + netCash;

  const summary: CashbookSummaryResponse = {
    businessDate,
    session: {
      id: sessionId,
      shopId: ctx.shopId,
      businessDate,
      status: 'OPEN',
      openingCashPoisha: payload.openingCashPoisha,
      expectedClosingCashPoisha: expectedClosing,
      actualClosingCashPoisha: null,
      variancePoisha: null,
      note: payload.note ?? null,
      openedByUserId: ctx.userId,
      openedByName: ctx.userName,
      closedByUserId: null,
      closedByName: null,
      openedAt: existing?.session?.openedAt ?? timestamp,
      closedAt: null,
      version: existing?.session?.version ?? 1,
      createdAt: existing?.session?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
    totals: existing?.totals ?? createEmptyCashbookTotals(),
    liveExpectedClosingCashPoisha: expectedClosing,
    previousClosedCashPoisha: existing?.previousClosedCashPoisha ?? null,
    entries: existing?.entries ?? [],
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO cashbook_daily_cache (shop_id, business_date, summary_json, cached_at)
       VALUES (?, ?, ?, ?)`,
      ctx.shopId,
      businessDate,
      JSON.stringify(summary),
      timestamp,
    );
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.OPEN_CASHBOOK,
      entityType: SyncEntityTypes.CASHBOOK_SESSION,
      entityId: sessionId,
      payload: {
        businessDate,
        openingCashPoisha: payload.openingCashPoisha,
        ...(payload.note !== undefined ? { note: payload.note } : {}),
      },
      localSnapshot: summary as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return summary;
}

export async function closeOfflineCashbookWithOutbox(
  ctx: OfflineActorContext,
  businessDate: string,
  payload: CloseCashbookPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<CashbookSummaryResponse> {
  const existing = await loadLocalCashbookSummary(ctx.shopId, businessDate);
  const timestamp = nowIso();
  const sessionId = existing?.session?.id ?? Crypto.randomUUID();
  const openingCash = existing?.session?.openingCashPoisha ?? 0;
  const expectedClosing = openingCash + (existing?.totals.netCashPoisha ?? 0);
  const variancePoisha = payload.actualClosingCashPoisha - expectedClosing;

  const summary: CashbookSummaryResponse = {
    businessDate,
    session: {
      id: sessionId,
      shopId: ctx.shopId,
      businessDate,
      status: 'CLOSED',
      openingCashPoisha: openingCash,
      expectedClosingCashPoisha: expectedClosing,
      actualClosingCashPoisha: payload.actualClosingCashPoisha,
      variancePoisha,
      note: payload.note ?? existing?.session?.note ?? null,
      openedByUserId: existing?.session?.openedByUserId ?? ctx.userId,
      openedByName: existing?.session?.openedByName ?? ctx.userName,
      closedByUserId: ctx.userId,
      closedByName: ctx.userName,
      openedAt: existing?.session?.openedAt ?? timestamp,
      closedAt: timestamp,
      version: (existing?.session?.version ?? 1) + 1,
      createdAt: existing?.session?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
    totals: existing?.totals ?? createEmptyCashbookTotals(),
    liveExpectedClosingCashPoisha: expectedClosing,
    previousClosedCashPoisha: existing?.previousClosedCashPoisha ?? null,
    entries: existing?.entries ?? [],
  };

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO cashbook_daily_cache (shop_id, business_date, summary_json, cached_at)
       VALUES (?, ?, ?, ?)`,
      ctx.shopId,
      businessDate,
      JSON.stringify(summary),
      timestamp,
    );
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CLOSE_CASHBOOK,
      entityType: SyncEntityTypes.CASHBOOK_SESSION,
      entityId: sessionId,
      dependsOnEntityId: sessionId,
      payload: {
        businessDate,
        actualClosingCashPoisha: payload.actualClosingCashPoisha,
        ...(payload.note !== undefined ? { note: payload.note } : {}),
      },
      localSnapshot: summary as unknown as Record<string, unknown>,
      occurredAt: timestamp,
    });
  });

  return summary;
}

export async function createOfflineManualCashbookEntryWithOutbox(
  ctx: OfflineActorContext,
  businessDate: string,
  payload: CreateManualCashbookEntryPayload,
  idempotencyKey = Crypto.randomUUID(),
): Promise<void> {
  const entryId = payload.id ?? Crypto.randomUUID();
  const timestamp = payload.occurredAt ?? nowIso();
  const existing = await loadLocalCashbookSummary(ctx.shopId, businessDate);
  const direction = payload.entryType === 'OWNER_CASH_IN' ? 'IN' : 'OUT';

  if (existing) {
    const totals: CashbookMethodTotalsDto = { ...existing.totals };
    if (direction === 'IN') {
      totals.totalInPoisha += payload.amountPoisha;
      totals.netAllMethodsPoisha += payload.amountPoisha;
      if (payload.method === 'CASH') {
        totals.cashInPoisha += payload.amountPoisha;
        totals.netCashPoisha += payload.amountPoisha;
      } else if (payload.method === 'BKASH') {
        totals.bkashInPoisha += payload.amountPoisha;
        totals.netBkashPoisha += payload.amountPoisha;
      } else if (payload.method === 'NAGAD') {
        totals.nagadInPoisha += payload.amountPoisha;
        totals.netNagadPoisha += payload.amountPoisha;
      } else {
        totals.otherInPoisha += payload.amountPoisha;
        totals.netOtherPoisha += payload.amountPoisha;
      }
    } else {
      totals.totalOutPoisha += payload.amountPoisha;
      totals.netAllMethodsPoisha -= payload.amountPoisha;
      if (payload.method === 'CASH') {
        totals.cashOutPoisha += payload.amountPoisha;
        totals.netCashPoisha -= payload.amountPoisha;
      } else if (payload.method === 'BKASH') {
        totals.bkashOutPoisha += payload.amountPoisha;
        totals.netBkashPoisha -= payload.amountPoisha;
      } else if (payload.method === 'NAGAD') {
        totals.nagadOutPoisha += payload.amountPoisha;
        totals.netNagadPoisha -= payload.amountPoisha;
      } else {
        totals.otherOutPoisha += payload.amountPoisha;
        totals.netOtherPoisha -= payload.amountPoisha;
      }
    }
    const expectedClosing = (existing.session?.openingCashPoisha ?? 0) + totals.netCashPoisha;
    const nextSummary: CashbookSummaryResponse = {
      ...existing,
      totals,
      liveExpectedClosingCashPoisha: expectedClosing,
      entries: [
        {
          id: entryId,
          shopId: ctx.shopId,
          sessionId: existing.session?.id ?? null,
          direction,
          entryType: payload.entryType,
          method: payload.method,
          amountPoisha: payload.amountPoisha,
          referenceType: 'MANUAL',
          referenceId: null,
          referenceNumber: null,
          note: payload.note ?? null,
          actorUserId: ctx.userId,
          actorName: ctx.userName,
          occurredAt: timestamp,
          createdAt: timestamp,
        },
        ...existing.entries,
      ],
    };
    const db = await getLocalDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT OR REPLACE INTO cashbook_daily_cache (shop_id, business_date, summary_json, cached_at)
         VALUES (?, ?, ?, ?)`,
        ctx.shopId,
        businessDate,
        JSON.stringify(nextSummary),
        timestamp,
      );
      await enqueueSyncOperationTx(db, {
        idempotencyKey,
        shopId: ctx.shopId,
        opType: SyncOperationTypes.CREATE_MANUAL_CASHBOOK_ENTRY,
        entityType: SyncEntityTypes.CASHBOOK_ENTRY,
        entityId: entryId,
        dependsOnEntityId: existing.session?.id ?? null,
        payload: {
          ...payload,
          businessDate,
          occurredAt: timestamp,
        },
        localSnapshot: nextSummary as unknown as Record<string, unknown>,
        occurredAt: timestamp,
      });
    });
    return;
  }

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await enqueueSyncOperationTx(db, {
      idempotencyKey,
      shopId: ctx.shopId,
      opType: SyncOperationTypes.CREATE_MANUAL_CASHBOOK_ENTRY,
      entityType: SyncEntityTypes.CASHBOOK_ENTRY,
      entityId: entryId,
      payload: {
        ...payload,
        businessDate,
        occurredAt: timestamp,
      },
      occurredAt: timestamp,
    });
  });
}

export async function rollbackConflictedLocalSaleIfNeeded(
  shopId: string,
  localSnapshot: Record<string, unknown> | null,
): Promise<void> {
  if (!localSnapshot) return;
  const sale = localSnapshot as unknown as SaleDto;
  if (!sale.id) return;

  const existingSale = await loadLocalSaleById(sale.id);
  if (!existingSale) return;

  const db = await getLocalDatabase();
  const productsToRestore: ProductDto[] = [];
  for (const item of existingSale.items) {
    const prod = await loadLocalProductById(item.productId);
    if (prod) {
      const restoredQty = addQuantities(prod.inventory.qtyBase, item.qtyBase);
      productsToRestore.push({
        ...prod,
        isLowStock: compareQuantities(restoredQty, prod.lowStockThresholdBase) <= 0,
        inventory: {
          ...prod.inventory,
          qtyBase: restoredQty,
          updatedAt: nowIso(),
        },
        updatedAt: nowIso(),
      });
    }
  }

  let restoredCustomer: CustomerDto | null = null;
  if (existingSale.customerId) {
    const cust = await loadLocalCustomerById(existingSale.customerId);
    if (cust && cust.shopId === shopId) {
      restoredCustomer = {
        ...cust,
        totalPurchasedPoisha: Math.max(0, cust.totalPurchasedPoisha - existingSale.totalPoisha),
        totalPaidPoisha: Math.max(0, cust.totalPaidPoisha - existingSale.paidPoisha),
        duePoisha: Math.max(0, cust.duePoisha - existingSale.duePoisha),
        updatedAt: nowIso(),
      };
    }
  }

  await db.withTransactionAsync(async () => {
    await removeLocalSaleTx(db, existingSale.id);
    for (const p of productsToRestore) {
      await writeSingleProductTx(db, p);
    }
    if (restoredCustomer) {
      await writeSingleCustomerTx(db, restoredCustomer);
    }
  });
}
