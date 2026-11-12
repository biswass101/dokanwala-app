import type {
  ExpenseAuditLogDto,
  ExpenseCategoryDto,
  ExpenseDto,
  PaymentMethod,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import { unwrapApiGet, unwrapApiPatch, unwrapApiPost } from './client';

export interface CreateExpenseCategoryPayload {
  id?: string;
  nameBn: string;
  nameEn?: string | null;
  sortOrder?: number;
}

export interface UpdateExpenseCategoryPayload {
  nameBn?: string;
  nameEn?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  expectedVersion?: number;
}

export interface CreateExpensePayload {
  id?: string;
  categoryId: string;
  amountPoisha: number;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
  incurredAt?: string;
}

export interface UpdateExpensePayload {
  categoryId?: string;
  amountPoisha?: number;
  method?: PaymentMethod;
  reference?: string | null;
  note?: string | null;
  incurredAt?: string;
  reason?: string | null;
  expectedVersion?: number;
}

export const expenseCategoriesApi = {
  list(params?: { includeInactive?: boolean }): Promise<{ categories: ExpenseCategoryDto[] }> {
    const query: Record<string, string> = {};
    if (params?.includeInactive) query.includeInactive = 'true';
    return unwrapApiGet('/expense-categories', query);
  },

  create(body: CreateExpenseCategoryPayload): Promise<{ category: ExpenseCategoryDto }> {
    return unwrapApiPost('/expense-categories', body);
  },

  update(
    id: string,
    body: UpdateExpenseCategoryPayload,
  ): Promise<{ category: ExpenseCategoryDto }> {
    return unwrapApiPatch(`/expense-categories/${id}`, body);
  },
};

export const expensesApi = {
  list(params?: {
    categoryId?: string;
    method?: PaymentMethod;
    from?: string;
    to?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{ expenses: ExpenseDto[]; totalExpensePoisha: number }> {
    const query: Record<string, string | number> = {};
    if (params?.categoryId) query.categoryId = params.categoryId;
    if (params?.method) query.method = params.method;
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    if (params?.q && params.q.trim().length > 0) query.q = params.q.trim();
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/expenses', query);
  },

  get(id: string): Promise<{ expense: ExpenseDto }> {
    return unwrapApiGet(`/expenses/${id}`);
  },

  create(
    body: CreateExpensePayload,
    idempotencyKey?: string,
  ): Promise<{ expense: ExpenseDto; idempotencyReplayed: boolean }> {
    const key = idempotencyKey ?? Crypto.randomUUID();
    return unwrapApiPost('/expenses', body, {
      'X-Idempotency-Key': key,
    });
  },

  update(id: string, body: UpdateExpensePayload): Promise<{ expense: ExpenseDto }> {
    return unwrapApiPatch(`/expenses/${id}`, body);
  },

  getHistory(id: string): Promise<{ expense: ExpenseDto; history: ExpenseAuditLogDto[] }> {
    return unwrapApiGet(`/expenses/${id}/history`);
  },
};
