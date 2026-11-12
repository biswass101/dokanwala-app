import type {
  ExpenseAuditLogDto,
  ExpenseCategoryDto,
  ExpenseDto,
  PaymentMethod,
} from '@dokanwala/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadLocalExpenseById,
  loadLocalExpenseCategories,
  loadLocalExpenseHistory,
  loadLocalExpenses,
  replaceLocalExpenses,
  saveLocalExpenseCategories,
  saveLocalExpenseHistory,
  upsertLocalExpense,
  upsertLocalExpenseCategory,
} from '@/database/repositories/customers-expenses-local.repo';
import {
  createOfflineExpenseCategoryWithOutbox,
  createOfflineExpenseWithOutbox,
  updateOfflineExpenseWithOutbox,
} from '@/database/repositories/offline-writes.repo';
import { ApiClientError } from '@/services/api/client';
import {
  expenseCategoriesApi,
  expensesApi,
  type CreateExpenseCategoryPayload,
  type CreateExpensePayload,
  type UpdateExpensePayload,
} from '@/services/api/expenses';
import {
  executeOnlineOrOffline,
  getOfflineActorContext,
} from '@/services/sync/offline-mutation-helper';
import { useAuthStore } from '@/store/auth.store';

export const expensesKeys = {
  all: ['expenses'] as const,
  list: (params: {
    categoryId?: string;
    method?: PaymentMethod;
    from?: string;
    to?: string;
    q?: string;
  }) => ['expenses', 'list', params] as const,
  detail: (id: string) => ['expenses', 'detail', id] as const,
  history: (id: string) => ['expenses', 'history', id] as const,
  categoriesAll: ['expense-categories'] as const,
};

function isNetworkFailure(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === 'NETWORK_ERROR';
}

export function useExpenseCategoriesQuery() {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');

  return useQuery<{ categories: ExpenseCategoryDto[]; fromOfflineCache: boolean }>({
    queryKey: expensesKeys.categoriesAll,
    queryFn: async () => {
      try {
        const res = await expenseCategoriesApi.list();
        await saveLocalExpenseCategories(res.categories);
        return { categories: res.categories, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalExpenseCategories(shopId);
          return { categories: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useCreateExpenseCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpenseCategoryPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => expenseCategoriesApi.create(payload),
        offlineFn: async () => ({
          category: await createOfflineExpenseCategoryWithOutbox(
            getOfflineActorContext(),
            payload,
          ),
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalExpenseCategory(res.category);
      await queryClient.invalidateQueries({ queryKey: expensesKeys.categoriesAll });
    },
  });
}

export function useExpensesQuery(params?: {
  categoryId?: string;
  method?: PaymentMethod;
  from?: string;
  to?: string;
  q?: string;
}) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');

  const normalized = {
    ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params?.method ? { method: params.method } : {}),
    ...(params?.from ? { from: params.from } : {}),
    ...(params?.to ? { to: params.to } : {}),
    ...(params?.q && params.q.trim().length > 0 ? { q: params.q.trim() } : {}),
  };

  const isUnfiltered =
    !normalized.categoryId &&
    !normalized.method &&
    !normalized.from &&
    !normalized.to &&
    !normalized.q;

  return useQuery<{
    expenses: ExpenseDto[];
    totalExpensePoisha: number;
    fromOfflineCache: boolean;
  }>({
    queryKey: expensesKeys.list(normalized),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await expensesApi.list({ ...normalized, limit: 100 });
        if (isUnfiltered) {
          await replaceLocalExpenses(res.expenses);
        }
        return {
          expenses: res.expenses,
          totalExpensePoisha: res.totalExpensePoisha,
          fromOfflineCache: false,
        };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalExpenses(shopId, normalized);
          return {
            expenses: cached.expenses,
            totalExpensePoisha: cached.totalExpensePoisha,
            fromOfflineCache: true,
          };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useExpenseDetailQuery(expenseId: string | undefined) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');

  return useQuery<{ expense: ExpenseDto; fromOfflineCache: boolean }>({
    queryKey: expensesKeys.detail(expenseId ?? ''),
    queryFn: async () => {
      if (!expenseId) {
        throw new Error('Expense ID missing');
      }
      try {
        const res = await expensesApi.get(expenseId);
        await upsertLocalExpense(res.expense);
        return { expense: res.expense, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err)) {
          const cached = await loadLocalExpenseById(expenseId);
          if (cached) {
            return { expense: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(expenseId) && Boolean(shopId),
  });
}

export function useExpenseHistoryQuery(expenseId: string | undefined) {
  const role = useAuthStore((s) => s.user?.role);

  return useQuery<{
    expense: ExpenseDto;
    history: ExpenseAuditLogDto[];
    fromOfflineCache: boolean;
  }>({
    queryKey: expensesKeys.history(expenseId ?? ''),
    queryFn: async () => {
      if (!expenseId) {
        throw new Error('Expense ID missing');
      }
      try {
        const res = await expensesApi.getHistory(expenseId);
        await saveLocalExpenseHistory(res.expense, res.history);
        return {
          expense: res.expense,
          history: res.history,
          fromOfflineCache: false,
        };
      } catch (err) {
        if (isNetworkFailure(err)) {
          const cached = await loadLocalExpenseHistory(expenseId);
          if (cached) {
            return {
              expense: cached.expense,
              history: cached.history,
              fromOfflineCache: true,
            };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(expenseId) && role === 'OWNER',
  });
}

export function useCreateExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CreateExpensePayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () => expensesApi.create(input.payload, input.idempotencyKey),
        offlineFn: async () => ({
          expense: await createOfflineExpenseWithOutbox(
            getOfflineActorContext(),
            input.payload,
            input.idempotencyKey,
          ),
          idempotencyReplayed: false,
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalExpense(res.expense);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: expensesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}

export function useUpdateExpenseMutation(expenseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateExpensePayload) =>
      executeOnlineOrOffline({
        onlineFn: () => expensesApi.update(expenseId, payload),
        offlineFn: async () => ({
          expense: await updateOfflineExpenseWithOutbox(
            getOfflineActorContext(),
            expenseId,
            payload,
          ),
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalExpense(res.expense);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: expensesKeys.all }),
        queryClient.invalidateQueries({ queryKey: expensesKeys.detail(expenseId) }),
        queryClient.invalidateQueries({ queryKey: expensesKeys.history(expenseId) }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}
