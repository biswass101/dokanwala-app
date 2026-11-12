import {
  normalizeUnicodeText,
  type PaymentMethod,
  type PurchaseDto,
  type PurchaseItemDto,
  type PurchaseRefundMethod,
  type PurchaseReturnDto,
  type PurchaseReturnItemDto,
  type PurchaseStatus,
  type SupplierDto,
  type SupplierLedgerEntryDto,
  type SupplierLedgerEntryType,
} from '@dokanwala/shared';
import { getLocalDatabase } from '../sqlite';
import type { SqliteDatabaseAdapter } from '../sqlite.types';

interface SupplierRow {
  id: string;
  shop_id: string;
  name_bn: string;
  name_en: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  total_purchased_poisha: number;
  total_paid_poisha: number;
  payable_poisha: number;
  is_active: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface PurchaseRow {
  id: string;
  shop_id: string;
  purchase_number: string;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  status: string;
  subtotal_poisha: number;
  discount_poisha: number;
  total_poisha: number;
  paid_poisha: number;
  settled_due_poisha: number;
  due_poisha: number;
  payment_method: string | null;
  payment_reference: string | null;
  returned_total_poisha: number;
  cash_refunded_poisha: number;
  note: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  purchased_at: string;
  created_at: string;
  updated_at: string;
}

interface PurchaseItemRow {
  id: string;
  purchase_id: string;
  product_id: string;
  unit_id: string;
  product_name_bn: string;
  product_name_en: string | null;
  unit_name_bn: string;
  unit_name_en: string;
  line_order: number;
  qty_display: string;
  conversion_factor_to_base: string;
  qty_base: string;
  returned_qty_base: string;
  unit_cost_poisha: number;
  line_total_poisha: number;
  net_cost_poisha: number;
}

interface PurchaseReturnRow {
  id: string;
  purchase_id: string;
  return_number: string;
  refund_method: string;
  subtotal_poisha: number;
  discount_adjustment_poisha: number;
  refund_total_poisha: number;
  cash_refund_poisha: number;
  payable_adjusted_poisha: number;
  reason: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  returned_at: string;
}

interface PurchaseReturnItemRow {
  id: string;
  purchase_return_id: string;
  purchase_item_id: string;
  product_id: string;
  product_name_bn: string;
  product_name_en: string | null;
  unit_name_bn: string;
  unit_name_en: string;
  qty_display: string;
  qty_base: string;
  unit_cost_poisha: number;
  line_refund_poisha: number;
  reversed_cost_poisha: number;
}

interface SupplierLedgerRow {
  id: string;
  supplier_id: string;
  type: string;
  reference_id: string;
  reference_number: string | null;
  occurred_at: string;
  total_poisha: number;
  paid_or_refunded_poisha: number;
  payable_delta_poisha: number;
  running_payable_poisha: number;
  method: string | null;
  note: string | null;
}

function hydrateSupplier(row: SupplierRow): SupplierDto {
  return {
    id: row.id,
    shopId: row.shop_id,
    nameBn: row.name_bn,
    nameEn: row.name_en,
    phone: row.phone,
    address: row.address,
    note: row.note,
    totalPurchasedPoisha: row.total_purchased_poisha,
    totalPaidPoisha: row.total_paid_poisha,
    payablePoisha: row.payable_poisha,
    isActive: row.is_active === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydratePurchase(
  row: PurchaseRow,
  itemRows: PurchaseItemRow[],
  returnRows: PurchaseReturnRow[],
  returnItemsByReturnId: Map<string, PurchaseReturnItemRow[]>,
): PurchaseDto {
  const items: PurchaseItemDto[] = [...itemRows]
    .sort((a, b) => a.line_order - b.line_order)
    .map((it) => ({
      id: it.id,
      purchaseId: it.purchase_id,
      productId: it.product_id,
      unitId: it.unit_id,
      productNameBn: it.product_name_bn,
      productNameEn: it.product_name_en,
      unitNameBn: it.unit_name_bn,
      unitNameEn: it.unit_name_en,
      lineOrder: it.line_order,
      qtyDisplay: it.qty_display,
      conversionFactorToBase: it.conversion_factor_to_base,
      qtyBase: it.qty_base,
      returnedQtyBase: it.returned_qty_base,
      unitCostPoisha: it.unit_cost_poisha,
      lineTotalPoisha: it.line_total_poisha,
      netCostPoisha: it.net_cost_poisha,
    }));

  const returns: PurchaseReturnDto[] = returnRows.map((ret) => {
    const riRows = returnItemsByReturnId.get(ret.id) ?? [];
    const riDtos: PurchaseReturnItemDto[] = riRows.map((ri) => ({
      id: ri.id,
      purchaseReturnId: ri.purchase_return_id,
      purchaseItemId: ri.purchase_item_id,
      productId: ri.product_id,
      productNameBn: ri.product_name_bn,
      productNameEn: ri.product_name_en,
      unitNameBn: ri.unit_name_bn,
      unitNameEn: ri.unit_name_en,
      qtyDisplay: ri.qty_display,
      qtyBase: ri.qty_base,
      unitCostPoisha: ri.unit_cost_poisha,
      lineRefundPoisha: ri.line_refund_poisha,
      reversedCostPoisha: ri.reversed_cost_poisha,
    }));
    return {
      id: ret.id,
      purchaseId: ret.purchase_id,
      returnNumber: ret.return_number,
      refundMethod: ret.refund_method as PurchaseRefundMethod,
      subtotalPoisha: ret.subtotal_poisha,
      discountAdjustmentPoisha: ret.discount_adjustment_poisha,
      refundTotalPoisha: ret.refund_total_poisha,
      cashRefundPoisha: ret.cash_refund_poisha,
      payableAdjustedPoisha: ret.payable_adjusted_poisha,
      reason: ret.reason,
      actorUserId: ret.actor_user_id,
      actorName: ret.actor_name,
      returnedAt: ret.returned_at,
      items: riDtos,
    };
  });

  return {
    id: row.id,
    shopId: row.shop_id,
    purchaseNumber: row.purchase_number,
    supplierId: row.supplier_id,
    supplierNameSnapshot: row.supplier_name_snapshot,
    status: row.status as PurchaseStatus,
    subtotalPoisha: row.subtotal_poisha,
    discountPoisha: row.discount_poisha,
    totalPoisha: row.total_poisha,
    paidPoisha: row.paid_poisha,
    settledDuePoisha: row.settled_due_poisha,
    duePoisha: row.due_poisha,
    paymentMethod: (row.payment_method as PaymentMethod | null) ?? null,
    paymentReference: row.payment_reference,
    returnedTotalPoisha: row.returned_total_poisha,
    cashRefundedPoisha: row.cash_refunded_poisha,
    note: row.note,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    purchasedAt: row.purchased_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    returns,
  };
}

async function writeSingleSupplier(db: SqliteDatabaseAdapter, s: SupplierDto): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO suppliers_local (
      id, shop_id, name_bn, name_en, phone, address, note,
      total_purchased_poisha, total_paid_poisha, payable_poisha,
      is_active, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.id,
    s.shopId,
    s.nameBn,
    s.nameEn,
    s.phone,
    s.address,
    s.note,
    s.totalPurchasedPoisha,
    s.totalPaidPoisha,
    s.payablePoisha,
    s.isActive ? 1 : 0,
    s.version,
    s.createdAt,
    s.updatedAt,
  );
}

async function writeSinglePurchase(db: SqliteDatabaseAdapter, p: PurchaseDto): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO purchases_local (
      id, shop_id, purchase_number, supplier_id, supplier_name_snapshot,
      status, subtotal_poisha, discount_poisha, total_poisha,
      paid_poisha, settled_due_poisha, due_poisha, payment_method, payment_reference,
      returned_total_poisha, cash_refunded_poisha, note, actor_user_id, actor_name,
      purchased_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id,
    p.shopId,
    p.purchaseNumber,
    p.supplierId,
    p.supplierNameSnapshot,
    p.status,
    p.subtotalPoisha,
    p.discountPoisha,
    p.totalPoisha,
    p.paidPoisha,
    p.settledDuePoisha,
    p.duePoisha,
    p.paymentMethod,
    p.paymentReference,
    p.returnedTotalPoisha,
    p.cashRefundedPoisha,
    p.note,
    p.actorUserId,
    p.actorName,
    p.purchasedAt,
    p.createdAt,
    p.updatedAt,
  );

  await db.runAsync(
    'DELETE FROM purchase_return_items_local WHERE purchase_return_id IN (SELECT id FROM purchase_returns_local WHERE purchase_id = ?)',
    p.id,
  );
  await db.runAsync('DELETE FROM purchase_returns_local WHERE purchase_id = ?', p.id);
  await db.runAsync('DELETE FROM purchase_items_local WHERE purchase_id = ?', p.id);

  for (const it of p.items) {
    await db.runAsync(
      `INSERT OR REPLACE INTO purchase_items_local (
        id, purchase_id, product_id, unit_id, product_name_bn, product_name_en,
        unit_name_bn, unit_name_en, line_order, qty_display, conversion_factor_to_base,
        qty_base, returned_qty_base, unit_cost_poisha, line_total_poisha, net_cost_poisha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      it.id,
      it.purchaseId,
      it.productId,
      it.unitId,
      it.productNameBn,
      it.productNameEn,
      it.unitNameBn,
      it.unitNameEn,
      it.lineOrder,
      it.qtyDisplay,
      it.conversionFactorToBase,
      it.qtyBase,
      it.returnedQtyBase,
      it.unitCostPoisha,
      it.lineTotalPoisha,
      it.netCostPoisha,
    );
  }

  for (const ret of p.returns) {
    await db.runAsync(
      `INSERT OR REPLACE INTO purchase_returns_local (
        id, purchase_id, return_number, refund_method, subtotal_poisha,
        discount_adjustment_poisha, refund_total_poisha, cash_refund_poisha,
        payable_adjusted_poisha, reason, actor_user_id, actor_name, returned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ret.id,
      ret.purchaseId,
      ret.returnNumber,
      ret.refundMethod,
      ret.subtotalPoisha,
      ret.discountAdjustmentPoisha,
      ret.refundTotalPoisha,
      ret.cashRefundPoisha,
      ret.payableAdjustedPoisha,
      ret.reason,
      ret.actorUserId,
      ret.actorName,
      ret.returnedAt,
    );

    for (const ri of ret.items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO purchase_return_items_local (
          id, purchase_return_id, purchase_item_id, product_id,
          product_name_bn, product_name_en, unit_name_bn, unit_name_en,
          qty_display, qty_base, unit_cost_poisha, line_refund_poisha, reversed_cost_poisha
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ri.id,
        ri.purchaseReturnId,
        ri.purchaseItemId,
        ri.productId,
        ri.productNameBn,
        ri.productNameEn,
        ri.unitNameBn,
        ri.unitNameEn,
        ri.qtyDisplay,
        ri.qtyBase,
        ri.unitCostPoisha,
        ri.lineRefundPoisha,
        ri.reversedCostPoisha,
      );
    }
  }
}

export async function writeSingleSupplierTx(
  db: SqliteDatabaseAdapter,
  supplier: SupplierDto,
): Promise<void> {
  await writeSingleSupplier(db, supplier);
}

export async function writeSinglePurchaseTx(
  db: SqliteDatabaseAdapter,
  purchase: PurchaseDto,
): Promise<void> {
  await writeSinglePurchase(db, purchase);
}

export async function loadLocalSupplierById(supplierId: string): Promise<SupplierDto | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<SupplierRow>(
    'SELECT * FROM suppliers_local WHERE id = ? LIMIT 1',
    supplierId,
  );
  return row ? hydrateSupplier(row) : null;
}

export async function removeLocalSupplier(shopId: string, supplierId: string): Promise<void> {
  const existing = await loadLocalSuppliers(shopId, { includeInactive: true });
  await saveLocalSuppliers(existing.filter((s) => s.id !== supplierId));
}

export async function saveLocalSuppliers(suppliers: readonly SupplierDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM suppliers_local');
    for (const s of suppliers) {
      await writeSingleSupplier(db, s);
    }
  });
}

export async function upsertLocalSupplier(supplier: SupplierDto): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleSupplier(db, supplier);
  });
}

export async function loadLocalSuppliers(
  shopId: string,
  filters?: { q?: string; withPayablesOnly?: boolean; includeInactive?: boolean },
): Promise<SupplierDto[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<SupplierRow>(
    'SELECT * FROM suppliers_local WHERE shop_id = ?',
    shopId,
  );
  const normalizedQ = filters?.q ? normalizeUnicodeText(filters.q).toLowerCase() : '';
  return rows
    .map(hydrateSupplier)
    .filter((s) => {
      if (!filters?.includeInactive && !s.isActive) return false;
      if (filters?.withPayablesOnly && s.payablePoisha <= 0) return false;
      if (normalizedQ.length > 0) {
        const matchBn = normalizeUnicodeText(s.nameBn).toLowerCase().includes(normalizedQ);
        const matchEn = s.nameEn
          ? normalizeUnicodeText(s.nameEn).toLowerCase().includes(normalizedQ)
          : false;
        const matchPhone = s.phone ? s.phone.toLowerCase().includes(normalizedQ) : false;
        const matchAddr = s.address
          ? normalizeUnicodeText(s.address).toLowerCase().includes(normalizedQ)
          : false;
        if (!matchBn && !matchEn && !matchPhone && !matchAddr) return false;
      }
      return true;
    })
    .sort((a, b) => b.payablePoisha - a.payablePoisha || a.nameBn.localeCompare(b.nameBn));
}

export async function saveLocalSupplierLedger(
  supplier: SupplierDto,
  entries: readonly SupplierLedgerEntryDto[],
): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleSupplier(db, supplier);
    await db.runAsync(
      'DELETE FROM supplier_ledger_entries_local WHERE supplier_id = ?',
      supplier.id,
    );
    for (const e of entries) {
      await db.runAsync(
        `INSERT OR REPLACE INTO supplier_ledger_entries_local (
          id, supplier_id, type, reference_id, reference_number, occurred_at,
          total_poisha, paid_or_refunded_poisha, payable_delta_poisha,
          running_payable_poisha, method, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id,
        supplier.id,
        e.type,
        e.referenceId,
        e.referenceNumber,
        e.occurredAt,
        e.totalPoisha,
        e.paidOrRefundedPoisha,
        e.payableDeltaPoisha,
        e.runningPayablePoisha,
        e.method,
        e.note,
      );
    }
  });
}

export async function loadLocalSupplierLedger(
  supplierId: string,
): Promise<{ supplier: SupplierDto; entries: SupplierLedgerEntryDto[] } | null> {
  const db = await getLocalDatabase();
  const supplierRow = await db.getFirstAsync<SupplierRow>(
    'SELECT * FROM suppliers_local WHERE id = ? LIMIT 1',
    supplierId,
  );
  if (!supplierRow) return null;

  const entryRows = await db.getAllAsync<SupplierLedgerRow>(
    'SELECT * FROM supplier_ledger_entries_local WHERE supplier_id = ? ORDER BY occurred_at ASC',
    supplierId,
  );

  return {
    supplier: hydrateSupplier(supplierRow),
    entries: entryRows.map((row) => ({
      id: row.id,
      type: row.type as SupplierLedgerEntryType,
      referenceId: row.reference_id,
      referenceNumber: row.reference_number,
      occurredAt: row.occurred_at,
      totalPoisha: row.total_poisha,
      paidOrRefundedPoisha: row.paid_or_refunded_poisha,
      payableDeltaPoisha: row.payable_delta_poisha,
      runningPayablePoisha: row.running_payable_poisha,
      method: (row.method as PaymentMethod | PurchaseRefundMethod | null) ?? null,
      note: row.note,
    })),
  };
}

export async function replaceLocalPurchases(purchases: readonly PurchaseDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM purchase_return_items_local');
    await db.runAsync('DELETE FROM purchase_returns_local');
    await db.runAsync('DELETE FROM purchase_items_local');
    await db.runAsync('DELETE FROM purchases_local');
    for (const p of purchases) {
      await writeSinglePurchase(db, p);
    }
  });
}

export async function upsertLocalPurchase(purchase: PurchaseDto): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSinglePurchase(db, purchase);
  });
}

export async function loadLocalPurchases(
  shopId: string,
  filters?: { status?: PurchaseStatus; dueOnly?: boolean; supplierId?: string; q?: string },
): Promise<PurchaseDto[]> {
  const db = await getLocalDatabase();
  const [purchaseRows, itemRows, returnRows, returnItemRows] = await Promise.all([
    db.getAllAsync<PurchaseRow>('SELECT * FROM purchases_local WHERE shop_id = ?', shopId),
    db.getAllAsync<PurchaseItemRow>('SELECT * FROM purchase_items_local'),
    db.getAllAsync<PurchaseReturnRow>('SELECT * FROM purchase_returns_local'),
    db.getAllAsync<PurchaseReturnItemRow>('SELECT * FROM purchase_return_items_local'),
  ]);

  const itemsByPurchase = new Map<string, PurchaseItemRow[]>();
  for (const r of itemRows) {
    const arr = itemsByPurchase.get(r.purchase_id);
    if (arr) arr.push(r);
    else itemsByPurchase.set(r.purchase_id, [r]);
  }

  const returnsByPurchase = new Map<string, PurchaseReturnRow[]>();
  for (const r of returnRows) {
    const arr = returnsByPurchase.get(r.purchase_id);
    if (arr) arr.push(r);
    else returnsByPurchase.set(r.purchase_id, [r]);
  }

  const returnItemsByReturn = new Map<string, PurchaseReturnItemRow[]>();
  for (const r of returnItemRows) {
    const arr = returnItemsByReturn.get(r.purchase_return_id);
    if (arr) arr.push(r);
    else returnItemsByReturn.set(r.purchase_return_id, [r]);
  }

  const qNorm = filters?.q ? normalizeUnicodeText(filters.q).toLowerCase() : '';

  return purchaseRows
    .map((row) =>
      hydratePurchase(
        row,
        itemsByPurchase.get(row.id) ?? [],
        returnsByPurchase.get(row.id) ?? [],
        returnItemsByReturn,
      ),
    )
    .filter((p) => {
      if (filters?.status && p.status !== filters.status) return false;
      if (filters?.dueOnly && p.duePoisha <= 0) return false;
      if (filters?.supplierId && p.supplierId !== filters.supplierId) return false;
      if (qNorm.length > 0) {
        const matchNum = p.purchaseNumber.toLowerCase().includes(qNorm);
        const matchSup = p.supplierNameSnapshot
          ? normalizeUnicodeText(p.supplierNameSnapshot).toLowerCase().includes(qNorm)
          : false;
        const matchItem = p.items.some((it) => {
          const bnMatch = normalizeUnicodeText(it.productNameBn).toLowerCase().includes(qNorm);
          const enMatch = it.productNameEn
            ? normalizeUnicodeText(it.productNameEn).toLowerCase().includes(qNorm)
            : false;
          return bnMatch || enMatch;
        });
        if (!matchNum && !matchSup && !matchItem) return false;
      }
      return true;
    })
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

export async function loadLocalPurchaseById(purchaseId: string): Promise<PurchaseDto | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<PurchaseRow>(
    'SELECT * FROM purchases_local WHERE id = ? LIMIT 1',
    purchaseId,
  );
  if (!row) return null;

  const [itemRows, returnRows] = await Promise.all([
    db.getAllAsync<PurchaseItemRow>(
      'SELECT * FROM purchase_items_local WHERE purchase_id = ? ORDER BY line_order ASC',
      purchaseId,
    ),
    db.getAllAsync<PurchaseReturnRow>(
      'SELECT * FROM purchase_returns_local WHERE purchase_id = ?',
      purchaseId,
    ),
  ]);

  const returnItemsByReturn = new Map<string, PurchaseReturnItemRow[]>();
  for (const ret of returnRows) {
    const riRows = await db.getAllAsync<PurchaseReturnItemRow>(
      'SELECT * FROM purchase_return_items_local WHERE purchase_return_id = ?',
      ret.id,
    );
    returnItemsByReturn.set(ret.id, riRows);
  }

  return hydratePurchase(row, itemRows, returnRows, returnItemsByReturn);
}

export async function clearLocalPurchasesData(): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM supplier_ledger_entries_local');
    await db.runAsync('DELETE FROM purchase_return_items_local');
    await db.runAsync('DELETE FROM purchase_returns_local');
    await db.runAsync('DELETE FROM purchase_items_local');
    await db.runAsync('DELETE FROM purchases_local');
    await db.runAsync('DELETE FROM suppliers_local');
  });
}
