import {
  normalizeUnicodeText,
  type CustomerDto,
  type DiscountType,
  type PaymentDto,
  type PaymentMethod,
  type RefundMethod,
  type SaleDto,
  type SaleItemDto,
  type SaleReturnDto,
  type SaleReturnItemDto,
  type SaleStatus,
} from '@dokanwala/shared';
import { getLocalDatabase } from '../sqlite';
import type { SqliteDatabaseAdapter } from '../sqlite.types';

interface CustomerRow {
  id: string;
  shop_id: string;
  name_bn: string;
  name_en: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  total_purchased_poisha: number;
  total_paid_poisha: number;
  due_poisha: number;
  is_active: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface SaleRow {
  id: string;
  shop_id: string;
  receipt_number: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  status: string;
  subtotal_poisha: number;
  discount_type: string;
  discount_value: string;
  discount_poisha: number;
  total_poisha: number;
  paid_poisha: number;
  due_poisha: number;
  tendered_poisha: number | null;
  change_poisha: number;
  returned_total_poisha: number;
  cash_refunded_poisha: number;
  cogs_poisha: number | null;
  estimated_profit_poisha: number | null;
  note: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  sold_at: string;
  created_at: string;
  updated_at: string;
}

interface SaleItemRow {
  id: string;
  sale_id: string;
  product_id: string;
  unit_id: string;
  product_name_bn: string;
  product_name_en: string | null;
  unit_name_bn: string;
  unit_name_en: string;
  qty_display: string;
  conversion_factor_to_base: string;
  qty_base: string;
  returned_qty_base: string;
  unit_selling_price_poisha: number;
  unit_cost_at_sale_bdt: string | null;
  line_subtotal_poisha: number;
  line_cogs_poisha: number | null;
}

interface PaymentRow {
  id: string;
  sale_id: string;
  method: string;
  amount_poisha: number;
  reference: string | null;
  received_at: string;
}

interface SaleReturnRow {
  id: string;
  sale_id: string;
  return_number: string;
  refund_method: string;
  subtotal_poisha: number;
  discount_adjustment_poisha: number;
  refund_total_poisha: number;
  cash_refund_poisha: number;
  credit_adjusted_poisha: number;
  reason: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  returned_at: string;
}

interface SaleReturnItemRow {
  id: string;
  sale_return_id: string;
  sale_item_id: string;
  product_id: string;
  product_name_bn: string;
  product_name_en: string | null;
  unit_name_bn: string;
  unit_name_en: string;
  qty_display: string;
  qty_base: string;
  unit_selling_price_poisha: number;
  line_refund_poisha: number;
  restored_cogs_poisha: number | null;
}

function hydrateCustomer(row: CustomerRow): CustomerDto {
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
    duePoisha: row.due_poisha,
    isActive: row.is_active === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateSale(
  row: SaleRow,
  itemRows: SaleItemRow[],
  paymentRows: PaymentRow[],
  returnRows: SaleReturnRow[],
  returnItemsByReturnId: Map<string, SaleReturnItemRow[]>,
): SaleDto {
  const items: SaleItemDto[] = itemRows.map((it) => ({
    id: it.id,
    saleId: it.sale_id,
    productId: it.product_id,
    unitId: it.unit_id,
    productNameBn: it.product_name_bn,
    productNameEn: it.product_name_en,
    unitNameBn: it.unit_name_bn,
    unitNameEn: it.unit_name_en,
    qtyDisplay: it.qty_display,
    conversionFactorToBase: it.conversion_factor_to_base,
    qtyBase: it.qty_base,
    returnedQtyBase: it.returned_qty_base,
    unitSellingPricePoisha: it.unit_selling_price_poisha,
    unitCostAtSaleBdt: it.unit_cost_at_sale_bdt,
    lineSubtotalPoisha: it.line_subtotal_poisha,
    lineCogsPoisha: it.line_cogs_poisha,
  }));

  const payments: PaymentDto[] = paymentRows.map((p) => ({
    id: p.id,
    saleId: p.sale_id,
    method: p.method as PaymentMethod,
    amountPoisha: p.amount_poisha,
    reference: p.reference,
    receivedAt: p.received_at,
  }));

  const returns: SaleReturnDto[] = returnRows.map((ret) => {
    const riRows = returnItemsByReturnId.get(ret.id) ?? [];
    const riDtos: SaleReturnItemDto[] = riRows.map((ri) => ({
      id: ri.id,
      saleReturnId: ri.sale_return_id,
      saleItemId: ri.sale_item_id,
      productId: ri.product_id,
      productNameBn: ri.product_name_bn,
      productNameEn: ri.product_name_en,
      unitNameBn: ri.unit_name_bn,
      unitNameEn: ri.unit_name_en,
      qtyDisplay: ri.qty_display,
      qtyBase: ri.qty_base,
      unitSellingPricePoisha: ri.unit_selling_price_poisha,
      lineRefundPoisha: ri.line_refund_poisha,
      restoredCogsPoisha: ri.restored_cogs_poisha,
    }));
    return {
      id: ret.id,
      saleId: ret.sale_id,
      returnNumber: ret.return_number,
      refundMethod: ret.refund_method as RefundMethod,
      subtotalPoisha: ret.subtotal_poisha,
      discountAdjustmentPoisha: ret.discount_adjustment_poisha,
      refundTotalPoisha: ret.refund_total_poisha,
      cashRefundPoisha: ret.cash_refund_poisha,
      creditAdjustedPoisha: ret.credit_adjusted_poisha,
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
    receiptNumber: row.receipt_number,
    customerId: row.customer_id,
    customerNameSnapshot: row.customer_name_snapshot,
    status: row.status as SaleStatus,
    subtotalPoisha: row.subtotal_poisha,
    discountType: row.discount_type as DiscountType,
    discountValue: row.discount_value,
    discountPoisha: row.discount_poisha,
    totalPoisha: row.total_poisha,
    paidPoisha: row.paid_poisha,
    duePoisha: row.due_poisha,
    tenderedPoisha: row.tendered_poisha,
    changePoisha: row.change_poisha,
    returnedTotalPoisha: row.returned_total_poisha,
    cashRefundedPoisha: row.cash_refunded_poisha,
    cogsPoisha: row.cogs_poisha,
    estimatedProfitPoisha: row.estimated_profit_poisha,
    note: row.note,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    soldAt: row.sold_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    payments,
    returns,
  };
}

async function writeSingleCustomer(db: SqliteDatabaseAdapter, c: CustomerDto): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO customers_local (
      id, shop_id, name_bn, name_en, phone, address, note,
      total_purchased_poisha, total_paid_poisha, due_poisha,
      is_active, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    c.id,
    c.shopId,
    c.nameBn,
    c.nameEn,
    c.phone,
    c.address,
    c.note,
    c.totalPurchasedPoisha,
    c.totalPaidPoisha,
    c.duePoisha,
    c.isActive ? 1 : 0,
    c.version,
    c.createdAt,
    c.updatedAt,
  );
}

async function writeSingleSale(db: SqliteDatabaseAdapter, s: SaleDto): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sales_local (
      id, shop_id, receipt_number, customer_id, customer_name_snapshot,
      status, subtotal_poisha, discount_type, discount_value, discount_poisha,
      total_poisha, paid_poisha, due_poisha, tendered_poisha, change_poisha,
      returned_total_poisha, cash_refunded_poisha, cogs_poisha, estimated_profit_poisha,
      note, actor_user_id, actor_name, cancelled_at, cancel_reason,
      sold_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.id,
    s.shopId,
    s.receiptNumber,
    s.customerId,
    s.customerNameSnapshot,
    s.status,
    s.subtotalPoisha,
    s.discountType,
    s.discountValue,
    s.discountPoisha,
    s.totalPoisha,
    s.paidPoisha,
    s.duePoisha,
    s.tenderedPoisha,
    s.changePoisha,
    s.returnedTotalPoisha,
    s.cashRefundedPoisha,
    s.cogsPoisha,
    s.estimatedProfitPoisha,
    s.note,
    s.actorUserId,
    s.actorName,
    s.cancelledAt,
    s.cancelReason,
    s.soldAt,
    s.createdAt,
    s.updatedAt,
  );

  await db.runAsync(
    'DELETE FROM sale_return_items_local WHERE sale_return_id IN (SELECT id FROM sale_returns_local WHERE sale_id = ?)',
    s.id,
  );
  await db.runAsync('DELETE FROM sale_returns_local WHERE sale_id = ?', s.id);
  await db.runAsync('DELETE FROM payments_local WHERE sale_id = ?', s.id);
  await db.runAsync('DELETE FROM sale_items_local WHERE sale_id = ?', s.id);

  for (const it of s.items) {
    await db.runAsync(
      `INSERT OR REPLACE INTO sale_items_local (
        id, sale_id, product_id, unit_id, product_name_bn, product_name_en,
        unit_name_bn, unit_name_en, qty_display, conversion_factor_to_base,
        qty_base, returned_qty_base, unit_selling_price_poisha,
        unit_cost_at_sale_bdt, line_subtotal_poisha, line_cogs_poisha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      it.id,
      it.saleId,
      it.productId,
      it.unitId,
      it.productNameBn,
      it.productNameEn,
      it.unitNameBn,
      it.unitNameEn,
      it.qtyDisplay,
      it.conversionFactorToBase,
      it.qtyBase,
      it.returnedQtyBase,
      it.unitSellingPricePoisha,
      it.unitCostAtSaleBdt,
      it.lineSubtotalPoisha,
      it.lineCogsPoisha,
    );
  }

  for (const p of s.payments) {
    await db.runAsync(
      `INSERT OR REPLACE INTO payments_local (
        id, sale_id, method, amount_poisha, reference, received_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      p.id,
      p.saleId,
      p.method,
      p.amountPoisha,
      p.reference,
      p.receivedAt,
    );
  }

  for (const ret of s.returns) {
    await db.runAsync(
      `INSERT OR REPLACE INTO sale_returns_local (
        id, sale_id, return_number, refund_method, subtotal_poisha,
        discount_adjustment_poisha, refund_total_poisha, cash_refund_poisha,
        credit_adjusted_poisha, reason, actor_user_id, actor_name, returned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ret.id,
      ret.saleId,
      ret.returnNumber,
      ret.refundMethod,
      ret.subtotalPoisha,
      ret.discountAdjustmentPoisha,
      ret.refundTotalPoisha,
      ret.cashRefundPoisha,
      ret.creditAdjustedPoisha,
      ret.reason,
      ret.actorUserId,
      ret.actorName,
      ret.returnedAt,
    );

    for (const ri of ret.items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sale_return_items_local (
          id, sale_return_id, sale_item_id, product_id, product_name_bn,
          product_name_en, unit_name_bn, unit_name_en, qty_display, qty_base,
          unit_selling_price_poisha, line_refund_poisha, restored_cogs_poisha
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ri.id,
        ri.saleReturnId,
        ri.saleItemId,
        ri.productId,
        ri.productNameBn,
        ri.productNameEn,
        ri.unitNameBn,
        ri.unitNameEn,
        ri.qtyDisplay,
        ri.qtyBase,
        ri.unitSellingPricePoisha,
        ri.lineRefundPoisha,
        ri.restoredCogsPoisha,
      );
    }
  }
}

export async function saveLocalCustomers(customers: readonly CustomerDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM customers_local');
    for (const c of customers) {
      await writeSingleCustomer(db, c);
    }
  });
}

export async function upsertLocalCustomer(customer: CustomerDto): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleCustomer(db, customer);
  });
}

export async function loadLocalCustomers(
  shopId: string,
  filters?: { q?: string; withDuesOnly?: boolean },
): Promise<CustomerDto[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<CustomerRow>(
    'SELECT * FROM customers_local WHERE shop_id = ?',
    shopId,
  );
  const normalizedQ = filters?.q ? normalizeUnicodeText(filters.q).toLowerCase() : '';
  return rows
    .map(hydrateCustomer)
    .filter((c) => {
      if (!c.isActive) return false;
      if (filters?.withDuesOnly && c.duePoisha <= 0) return false;
      if (normalizedQ.length > 0) {
        const matchBn = normalizeUnicodeText(c.nameBn).toLowerCase().includes(normalizedQ);
        const matchEn = c.nameEn
          ? normalizeUnicodeText(c.nameEn).toLowerCase().includes(normalizedQ)
          : false;
        const matchPhone = c.phone ? c.phone.toLowerCase().includes(normalizedQ) : false;
        if (!matchBn && !matchEn && !matchPhone) return false;
      }
      return true;
    })
    .sort((a, b) => b.duePoisha - a.duePoisha || a.nameBn.localeCompare(b.nameBn));
}

export async function replaceLocalSales(sales: readonly SaleDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sale_return_items_local');
    await db.runAsync('DELETE FROM sale_returns_local');
    await db.runAsync('DELETE FROM payments_local');
    await db.runAsync('DELETE FROM sale_items_local');
    await db.runAsync('DELETE FROM sales_local');
    for (const s of sales) {
      await writeSingleSale(db, s);
    }
  });
}

export async function upsertLocalSale(sale: SaleDto): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleSale(db, sale);
  });
}

export async function loadLocalSales(
  shopId: string,
  filters?: { status?: SaleStatus; dueOnly?: boolean; q?: string },
): Promise<SaleDto[]> {
  const db = await getLocalDatabase();
  const [saleRows, itemRows, paymentRows, returnRows, returnItemRows] = await Promise.all([
    db.getAllAsync<SaleRow>('SELECT * FROM sales_local WHERE shop_id = ?', shopId),
    db.getAllAsync<SaleItemRow>('SELECT * FROM sale_items_local'),
    db.getAllAsync<PaymentRow>('SELECT * FROM payments_local'),
    db.getAllAsync<SaleReturnRow>('SELECT * FROM sale_returns_local'),
    db.getAllAsync<SaleReturnItemRow>('SELECT * FROM sale_return_items_local'),
  ]);

  const itemsBySale = new Map<string, SaleItemRow[]>();
  for (const r of itemRows) {
    const arr = itemsBySale.get(r.sale_id);
    if (arr) arr.push(r);
    else itemsBySale.set(r.sale_id, [r]);
  }

  const paymentsBySale = new Map<string, PaymentRow[]>();
  for (const r of paymentRows) {
    const arr = paymentsBySale.get(r.sale_id);
    if (arr) arr.push(r);
    else paymentsBySale.set(r.sale_id, [r]);
  }

  const returnsBySale = new Map<string, SaleReturnRow[]>();
  for (const r of returnRows) {
    const arr = returnsBySale.get(r.sale_id);
    if (arr) arr.push(r);
    else returnsBySale.set(r.sale_id, [r]);
  }

  const returnItemsByReturn = new Map<string, SaleReturnItemRow[]>();
  for (const r of returnItemRows) {
    const arr = returnItemsByReturn.get(r.sale_return_id);
    if (arr) arr.push(r);
    else returnItemsByReturn.set(r.sale_return_id, [r]);
  }

  const qNorm = filters?.q ? normalizeUnicodeText(filters.q).toLowerCase() : '';

  return saleRows
    .map((row) =>
      hydrateSale(
        row,
        itemsBySale.get(row.id) ?? [],
        paymentsBySale.get(row.id) ?? [],
        returnsBySale.get(row.id) ?? [],
        returnItemsByReturn,
      ),
    )
    .filter((s) => {
      if (filters?.status && s.status !== filters.status) return false;
      if (filters?.dueOnly && s.duePoisha <= 0) return false;
      if (qNorm.length > 0) {
        const matchReceipt = s.receiptNumber.toLowerCase().includes(qNorm);
        const matchCust = s.customerNameSnapshot
          ? normalizeUnicodeText(s.customerNameSnapshot).toLowerCase().includes(qNorm)
          : false;
        if (!matchReceipt && !matchCust) return false;
      }
      return true;
    })
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export async function loadLocalSaleById(saleId: string): Promise<SaleDto | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<SaleRow>(
    'SELECT * FROM sales_local WHERE id = ? LIMIT 1',
    saleId,
  );
  if (!row) return null;

  const [itemRows, paymentRows, returnRows] = await Promise.all([
    db.getAllAsync<SaleItemRow>('SELECT * FROM sale_items_local WHERE sale_id = ?', saleId),
    db.getAllAsync<PaymentRow>('SELECT * FROM payments_local WHERE sale_id = ?', saleId),
    db.getAllAsync<SaleReturnRow>('SELECT * FROM sale_returns_local WHERE sale_id = ?', saleId),
  ]);

  const returnItemsByReturn = new Map<string, SaleReturnItemRow[]>();
  for (const ret of returnRows) {
    const riRows = await db.getAllAsync<SaleReturnItemRow>(
      'SELECT * FROM sale_return_items_local WHERE sale_return_id = ?',
      ret.id,
    );
    returnItemsByReturn.set(ret.id, riRows);
  }

  return hydrateSale(row, itemRows, paymentRows, returnRows, returnItemsByReturn);
}

export async function clearLocalSalesData(): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sale_return_items_local');
    await db.runAsync('DELETE FROM sale_returns_local');
    await db.runAsync('DELETE FROM payments_local');
    await db.runAsync('DELETE FROM sale_items_local');
    await db.runAsync('DELETE FROM sales_local');
    await db.runAsync('DELETE FROM customers_local');
  });
}
