import {
  getDhakaYmd,
  normalizeUnicodeText,
  type CustomerDto,
  type CustomerLedgerEntryDto,
  type ExpenseAuditLogDto,
  type ExpenseAuditSnapshot,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type PaymentMethod,
  type RefundMethod,
} from '@dokanwala/shared';
import { getLocalDatabase } from '../sqlite';
import type { SqliteDatabaseAdapter } from '../sqlite.types';
import { upsertLocalCustomer } from './sales-local.repo';

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

interface CustomerLedgerEntryRow {
  id: string;
  customer_id: string;
  type: string;
  reference_id: string;
  reference_number: string | null;
  occurred_at: string;
  total_poisha: number;
  paid_or_refunded_poisha: number;
  due_delta_poisha: number;
  running_due_poisha: number;
  method: string | null;
  note: string | null;
}

interface ExpenseCategoryRow {
  id: string;
  shop_id: string;
  name_bn: string;
  name_en: string | null;
  is_default: number;
  sort_order: number;
  is_active: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ExpenseRow {
  id: string;
  shop_id: string;
  category_id: string;
  category_name_bn: string;
  category_name_en: string | null;
  amount_poisha: number;
  method: string;
  reference: string | null;
  note: string | null;
  incurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ExpenseAuditLogRow {
  id: string;
  shop_id: string;
  expense_id: string;
  action: string;
  edited_by_id: string | null;
  edited_by_name: string | null;
  before_json: string | null;
  after_json: string;
  reason: string | null;
  occurred_at: string;
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

function hydrateExpenseCategory(row: ExpenseCategoryRow): ExpenseCategoryDto {
  return {
    id: row.id,
    shopId: row.shop_id,
    nameBn: row.name_bn,
    nameEn: row.name_en,
    isDefault: row.is_default === 1,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateExpense(row: ExpenseRow): ExpenseDto {
  return {
    id: row.id,
    shopId: row.shop_id,
    categoryId: row.category_id,
    categoryNameBn: row.category_name_bn,
    categoryNameEn: row.category_name_en,
    amountPoisha: row.amount_poisha,
    method: row.method as PaymentMethod,
    reference: row.reference,
    note: row.note,
    incurredAt: row.incurred_at,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveLocalCustomerLedger(
  customer: CustomerDto,
  entries: CustomerLedgerEntryDto[],
): Promise<void> {
  await upsertLocalCustomer(customer);
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM customer_ledger_entries_local WHERE customer_id = ?',
      customer.id,
    );
    for (const e of entries) {
      await db.runAsync(
        `INSERT OR REPLACE INTO customer_ledger_entries_local (
          id, customer_id, type, reference_id, reference_number, occurred_at,
          total_poisha, paid_or_refunded_poisha, due_delta_poisha, running_due_poisha,
          method, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id,
        customer.id,
        e.type,
        e.referenceId,
        e.referenceNumber,
        e.occurredAt,
        e.totalPoisha,
        e.paidOrRefundedPoisha,
        e.dueDeltaPoisha,
        e.runningDuePoisha,
        e.method,
        e.note,
      );
    }
  });
}

export async function loadLocalCustomerLedger(customerId: string): Promise<{
  customer: CustomerDto;
  entries: CustomerLedgerEntryDto[];
} | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<CustomerRow>(
    'SELECT * FROM customers_local WHERE id = ? LIMIT 1',
    customerId,
  );
  if (!row) return null;

  const entryRows = await db.getAllAsync<CustomerLedgerEntryRow>(
    'SELECT * FROM customer_ledger_entries_local WHERE customer_id = ? ORDER BY occurred_at ASC',
    customerId,
  );

  return {
    customer: hydrateCustomer(row),
    entries: entryRows.map((e) => ({
      id: e.id,
      type: e.type as CustomerLedgerEntryDto['type'],
      referenceId: e.reference_id,
      referenceNumber: e.reference_number,
      occurredAt: e.occurred_at,
      totalPoisha: e.total_poisha,
      paidOrRefundedPoisha: e.paid_or_refunded_poisha,
      dueDeltaPoisha: e.due_delta_poisha,
      runningDuePoisha: e.running_due_poisha,
      method: (e.method as PaymentMethod | RefundMethod | null) ?? null,
      note: e.note,
    })),
  };
}

export async function saveLocalExpenseCategories(categories: ExpenseCategoryDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM expense_categories_local');
    for (const c of categories) {
      await db.runAsync(
        `INSERT OR REPLACE INTO expense_categories_local (
          id, shop_id, name_bn, name_en, is_default, sort_order, is_active,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id,
        c.shopId,
        c.nameBn,
        c.nameEn,
        c.isDefault ? 1 : 0,
        c.sortOrder,
        c.isActive ? 1 : 0,
        c.version,
        c.createdAt,
        c.updatedAt,
      );
    }
  });
}

export async function upsertLocalExpenseCategoryTx(
  db: SqliteDatabaseAdapter,
  c: ExpenseCategoryDto,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO expense_categories_local (
      id, shop_id, name_bn, name_en, is_default, sort_order, is_active,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    c.id,
    c.shopId,
    c.nameBn,
    c.nameEn,
    c.isDefault ? 1 : 0,
    c.sortOrder,
    c.isActive ? 1 : 0,
    c.version,
    c.createdAt,
    c.updatedAt,
  );
}

export async function upsertLocalExpenseCategory(c: ExpenseCategoryDto): Promise<void> {
  const db = await getLocalDatabase();
  await upsertLocalExpenseCategoryTx(db, c);
}

export async function removeLocalExpenseCategory(shopId: string, categoryId: string): Promise<void> {
  const existing = await loadLocalExpenseCategories(shopId);
  await saveLocalExpenseCategories(existing.filter((c) => c.id !== categoryId));
}

export async function loadLocalExpenseCategories(shopId: string): Promise<ExpenseCategoryDto[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<ExpenseCategoryRow>(
    'SELECT * FROM expense_categories_local WHERE shop_id = ?',
    shopId,
  );
  return rows
    .map(hydrateExpenseCategory)
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameBn.localeCompare(b.nameBn));
}

export async function replaceLocalExpenses(expenses: ExpenseDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM expenses_local');
    for (const e of expenses) {
      await db.runAsync(
        `INSERT OR REPLACE INTO expenses_local (
          id, shop_id, category_id, category_name_bn, category_name_en,
          amount_poisha, method, reference, note, incurred_at,
          actor_user_id, actor_name, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id,
        e.shopId,
        e.categoryId,
        e.categoryNameBn,
        e.categoryNameEn,
        e.amountPoisha,
        e.method,
        e.reference,
        e.note,
        e.incurredAt,
        e.actorUserId,
        e.actorName,
        e.version,
        e.createdAt,
        e.updatedAt,
      );
    }
  });
}

export async function upsertLocalExpenseTx(
  db: SqliteDatabaseAdapter,
  e: ExpenseDto,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO expenses_local (
      id, shop_id, category_id, category_name_bn, category_name_en,
      amount_poisha, method, reference, note, incurred_at,
      actor_user_id, actor_name, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.id,
    e.shopId,
    e.categoryId,
    e.categoryNameBn,
    e.categoryNameEn,
    e.amountPoisha,
    e.method,
    e.reference,
    e.note,
    e.incurredAt,
    e.actorUserId,
    e.actorName,
    e.version,
    e.createdAt,
    e.updatedAt,
  );
}

export async function upsertLocalExpense(e: ExpenseDto): Promise<void> {
  const db = await getLocalDatabase();
  await upsertLocalExpenseTx(db, e);
}

export async function loadLocalExpenses(
  shopId: string,
  filters?: {
    categoryId?: string;
    method?: PaymentMethod;
    from?: string;
    to?: string;
    q?: string;
  },
): Promise<{ expenses: ExpenseDto[]; totalExpensePoisha: number }> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<ExpenseRow>(
    'SELECT * FROM expenses_local WHERE shop_id = ?',
    shopId,
  );
  const qNorm = filters?.q ? normalizeUnicodeText(filters.q).toLowerCase() : '';

  const filtered = rows
    .map(hydrateExpense)
    .filter((e) => {
      if (filters?.categoryId && e.categoryId !== filters.categoryId) return false;
      if (filters?.method && e.method !== filters.method) return false;
      if (filters?.from || filters?.to) {
        const ymd = getDhakaYmd(e.incurredAt);
        if (filters.from && ymd < filters.from) return false;
        if (filters.to && ymd > filters.to) return false;
      }
      if (qNorm.length > 0) {
        const catHit = normalizeUnicodeText(e.categoryNameBn).toLowerCase().includes(qNorm);
        const noteHit = e.note ? normalizeUnicodeText(e.note).toLowerCase().includes(qNorm) : false;
        const refHit = e.reference ? e.reference.toLowerCase().includes(qNorm) : false;
        if (!catHit && !noteHit && !refHit) return false;
      }
      return true;
    })
    .sort((a, b) => b.incurredAt.localeCompare(a.incurredAt));

  const totalExpensePoisha = filtered.reduce((sum, e) => sum + e.amountPoisha, 0);
  return { expenses: filtered, totalExpensePoisha };
}

export async function loadLocalExpenseById(expenseId: string): Promise<ExpenseDto | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<ExpenseRow>(
    'SELECT * FROM expenses_local WHERE id = ? LIMIT 1',
    expenseId,
  );
  return row ? hydrateExpense(row) : null;
}

export async function saveLocalExpenseHistory(
  expense: ExpenseDto,
  history: ExpenseAuditLogDto[],
): Promise<void> {
  await upsertLocalExpense(expense);
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM expense_audit_logs_local WHERE expense_id = ?', expense.id);
    for (const h of history) {
      await db.runAsync(
        `INSERT OR REPLACE INTO expense_audit_logs_local (
          id, shop_id, expense_id, action, edited_by_id, edited_by_name,
          before_json, after_json, reason, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        h.id,
        h.shopId,
        h.expenseId,
        h.action,
        h.editedById,
        h.editedByName,
        h.beforeJson ? JSON.stringify(h.beforeJson) : null,
        JSON.stringify(h.afterJson),
        h.reason,
        h.occurredAt,
      );
    }
  });
}

export async function loadLocalExpenseHistory(expenseId: string): Promise<{
  expense: ExpenseDto;
  history: ExpenseAuditLogDto[];
} | null> {
  const db = await getLocalDatabase();
  const expRow = await db.getFirstAsync<ExpenseRow>(
    'SELECT * FROM expenses_local WHERE id = ? LIMIT 1',
    expenseId,
  );
  if (!expRow) return null;

  const logRows = await db.getAllAsync<ExpenseAuditLogRow>(
    'SELECT * FROM expense_audit_logs_local WHERE expense_id = ? ORDER BY occurred_at DESC',
    expenseId,
  );

  return {
    expense: hydrateExpense(expRow),
    history: logRows.map((h) => ({
      id: h.id,
      shopId: h.shop_id,
      expenseId: h.expense_id,
      action: h.action as ExpenseAuditLogDto['action'],
      editedById: h.edited_by_id,
      editedByName: h.edited_by_name,
      beforeJson: h.before_json ? (JSON.parse(h.before_json) as ExpenseAuditSnapshot) : null,
      afterJson: JSON.parse(h.after_json) as ExpenseAuditSnapshot,
      reason: h.reason,
      occurredAt: h.occurred_at,
    })),
  };
}

export async function clearLocalCustomersExpensesData(): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM customer_ledger_entries_local');
    await db.runAsync('DELETE FROM expense_audit_logs_local');
    await db.runAsync('DELETE FROM expenses_local');
    await db.runAsync('DELETE FROM expense_categories_local');
  });
}
