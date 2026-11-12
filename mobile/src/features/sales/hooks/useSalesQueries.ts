import type { CustomerDto, SaleDto, SaleStatus } from '@dokanwala/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelOfflineSaleWithOutbox,
  createOfflineCustomerWithOutbox,
  createOfflineSaleReturnWithOutbox,
  createOfflineSaleWithOutbox,
} from '@/database/repositories/offline-writes.repo';
import {
  loadLocalCustomers,
  loadLocalSaleById,
  loadLocalSales,
  replaceLocalSales,
  saveLocalCustomers,
  upsertLocalCustomer,
  upsertLocalSale,
} from '@/database/repositories/sales-local.repo';
import { ApiClientError } from '@/services/api/client';
import {
  executeOnlineOrOffline,
  getOfflineActorContext,
} from '@/services/sync/offline-mutation-helper';
import {
  customersApi,
  salesApi,
  type CancelSalePayload,
  type CreateCustomerPayload,
  type CreateSalePayload,
  type CreateSaleReturnPayload,
} from '@/services/api/sales';
import { useAuthStore } from '@/store/auth.store';

export const salesKeys = {
  all: ['sales'] as const,
  list: (params: {
    status?: SaleStatus;
    dueOnly?: boolean;
    q?: string;
    customerId?: string;
    from?: string;
    to?: string;
  }) => ['sales', 'list', params] as const,
  detail: (id: string) => ['sales', 'detail', id] as const,
  customersAll: ['customers'] as const,
  customersList: (params: { q?: string; withDuesOnly?: boolean }) =>
    ['customers', 'list', params] as const,
};

function isNetworkFailure(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === 'NETWORK_ERROR';
}

export function useCustomersQuery(params?: { q?: string; withDuesOnly?: boolean }) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const normalized = {
    ...(params?.q && params.q.trim().length > 0 ? { q: params.q.trim() } : {}),
    ...(params?.withDuesOnly ? { withDuesOnly: true } : {}),
  };
  const isUnfiltered = !normalized.q && !normalized.withDuesOnly;

  return useQuery<{ customers: CustomerDto[]; fromOfflineCache: boolean }>({
    queryKey: salesKeys.customersList(normalized),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await customersApi.list({ ...normalized, limit: 100 });
        if (isUnfiltered) {
          await saveLocalCustomers(res.customers);
        }
        return { customers: res.customers, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalCustomers(shopId, normalized);
          return { customers: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useCreateCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCustomerPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => customersApi.create(payload),
        offlineFn: async () => ({
          customer: await createOfflineCustomerWithOutbox(getOfflineActorContext(), payload),
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalCustomer(res.customer);
      await queryClient.invalidateQueries({ queryKey: salesKeys.customersAll });
    },
  });
}

export function useSalesQuery(params?: {
  status?: SaleStatus;
  dueOnly?: boolean;
  q?: string;
  customerId?: string;
  from?: string;
  to?: string;
}) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const normalized = {
    ...(params?.status ? { status: params.status } : {}),
    ...(params?.dueOnly ? { dueOnly: true } : {}),
    ...(params?.q && params.q.trim().length > 0 ? { q: params.q.trim() } : {}),
    ...(params?.customerId ? { customerId: params.customerId } : {}),
    ...(params?.from ? { from: params.from } : {}),
    ...(params?.to ? { to: params.to } : {}),
  };

  const isUnfiltered =
    !normalized.status &&
    !normalized.dueOnly &&
    !normalized.q &&
    !normalized.customerId &&
    !normalized.from &&
    !normalized.to;

  return useQuery<{ sales: SaleDto[]; fromOfflineCache: boolean }>({
    queryKey: salesKeys.list(normalized),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await salesApi.list({ ...normalized, limit: 50 });
        if (isUnfiltered) {
          await replaceLocalSales(res.sales);
        }
        return { sales: res.sales, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalSales(shopId, {
            ...(normalized.status ? { status: normalized.status } : {}),
            ...(normalized.dueOnly ? { dueOnly: true } : {}),
            ...(normalized.q ? { q: normalized.q } : {}),
          });
          return { sales: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useFrequentSoldProductIdsQuery() {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');

  return useQuery<string[]>({
    queryKey: ['sales', 'frequent-local', shopId],
    queryFn: async () => {
      if (!shopId) return [];
      const cachedSales = await loadLocalSales(shopId);
      const counts = new Map<string, number>();
      for (const sale of cachedSales) {
        if (sale.status === 'CANCELLED') continue;
        for (const item of sale.items) {
          counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
        }
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([productId]) => productId);
    },
    enabled: Boolean(shopId),
  });
}

export function useSaleDetailQuery(saleId: string | undefined) {
  return useQuery<{ sale: SaleDto; fromOfflineCache: boolean }>({
    queryKey: salesKeys.detail(saleId ?? ''),
    queryFn: async () => {
      if (!saleId) {
        throw new Error('Sale ID missing');
      }
      try {
        const res = await salesApi.get(saleId);
        await upsertLocalSale(res.sale);
        return { sale: res.sale, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err)) {
          const cached = await loadLocalSaleById(saleId);
          if (cached) {
            return { sale: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(saleId),
  });
}

export function useCreateSaleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CreateSalePayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () => salesApi.create(input.payload, input.idempotencyKey),
        offlineFn: async () => ({
          sale: await createOfflineSaleWithOutbox(
            getOfflineActorContext(),
            input.payload,
            input.idempotencyKey,
          ),
          idempotencyReplayed: false,
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalSale(res.sale);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: salesKeys.customersAll }),
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}

export function useCreateSaleReturnMutation(saleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CreateSaleReturnPayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () => salesApi.createReturn(saleId, input.payload, input.idempotencyKey),
        offlineFn: async () => {
          const sale = await createOfflineSaleReturnWithOutbox(
            getOfflineActorContext(),
            saleId,
            input.payload,
            input.idempotencyKey,
          );
          const latestReturn = sale.returns[sale.returns.length - 1];
          if (!latestReturn) {
            throw new Error('Offline sale return missing');
          }
          return {
            sale,
            saleReturn: latestReturn,
            idempotencyReplayed: false,
          };
        },
      }),
    onSuccess: async (res) => {
      await upsertLocalSale(res.sale);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: salesKeys.customersAll }),
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}

export function useCancelSaleMutation(saleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CancelSalePayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () => salesApi.cancel(saleId, input.payload, input.idempotencyKey),
        offlineFn: async () => ({
          sale: await cancelOfflineSaleWithOutbox(
            getOfflineActorContext(),
            saleId,
            input.payload,
            input.idempotencyKey,
          ),
          idempotencyReplayed: false,
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalSale(res.sale);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: salesKeys.customersAll }),
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}
