import {
  getDhakaYmd,
  type CashbookSummaryResponse,
  type DashboardSummaryResponse,
  type DuesReportResponse,
  type ProductsReportResponse,
  type ProfitLossReportResponse,
  type SalesReportPeriod,
  type SalesReportResponse,
} from '@dokanwala/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadLocalCashbookSummary,
  loadLocalReportSnapshot,
  saveLocalCashbookSummary,
  saveLocalReportSnapshot,
} from '@/database/repositories/cashbook-reports-local.repo';
import {
  closeOfflineCashbookWithOutbox,
  createOfflineManualCashbookEntryWithOutbox,
  openOfflineCashbookWithOutbox,
} from '@/database/repositories/offline-writes.repo';
import {
  cashbookApi,
  type CloseCashbookPayload,
  type CreateManualCashbookEntryPayload,
  type OpenCashbookPayload,
  type ReopenCashbookPayload,
} from '@/services/api/cashbook';
import { ApiClientError } from '@/services/api/client';
import { reportsApi } from '@/services/api/reports';
import {
  executeOnlineOrOffline,
  getOfflineActorContext,
} from '@/services/sync/offline-mutation-helper';
import { useAuthStore } from '@/store/auth.store';

export const cashbookKeys = {
  all: ['cashbook'] as const,
  day: (businessDate: string) => ['cashbook', 'day', businessDate] as const,
};

export const reportsKeys = {
  all: ['reports'] as const,
  dashboard: () => ['reports', 'dashboard'] as const,
  sales: (period: SalesReportPeriod, from?: string, to?: string) =>
    ['reports', 'sales', period, from ?? '', to ?? ''] as const,
  products: (from?: string, to?: string) => ['reports', 'products', from ?? '', to ?? ''] as const,
  profitLoss: (from?: string, to?: string) =>
    ['reports', 'profit-loss', from ?? '', to ?? ''] as const,
  dues: () => ['reports', 'dues'] as const,
};

function isNetworkFailure(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === 'NETWORK_ERROR';
}

export function useDashboardSummaryQuery() {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const role = useAuthStore((s) => s.user?.role ?? 'EMPLOYEE');

  return useQuery<{ dashboard: DashboardSummaryResponse; fromOfflineCache: boolean }>({
    queryKey: reportsKeys.dashboard(),
    queryFn: async () => {
      const cacheKey = `dashboard:${role}`;
      try {
        const res = await reportsApi.getDashboard();
        await saveLocalReportSnapshot(shopId, cacheKey, res.dashboard);
        return { dashboard: res.dashboard, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalReportSnapshot<DashboardSummaryResponse>(shopId, cacheKey);
          if (cached) {
            return { dashboard: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useCashbookSummaryQuery(businessDate?: string) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const resolvedDate = businessDate ?? getDhakaYmd();

  return useQuery<{ summary: CashbookSummaryResponse; fromOfflineCache: boolean }>({
    queryKey: cashbookKeys.day(resolvedDate),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const summary = await cashbookApi.getSummary(resolvedDate);
        await saveLocalCashbookSummary(shopId, resolvedDate, summary);
        return { summary, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalCashbookSummary(shopId, resolvedDate);
          if (cached) {
            return { summary: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useOpenCashbookMutation(businessDate: string) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OpenCashbookPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => cashbookApi.open(payload),
        offlineFn: () =>
          openOfflineCashbookWithOutbox(getOfflineActorContext(), businessDate, payload),
      }),
    onSuccess: async (summary) => {
      await saveLocalCashbookSummary(shopId, businessDate, summary);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashbookKeys.day(businessDate) }),
        queryClient.invalidateQueries({ queryKey: reportsKeys.dashboard() }),
      ]);
    },
  });
}

export function useCloseCashbookMutation(businessDate: string) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CloseCashbookPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => cashbookApi.close(payload),
        offlineFn: () =>
          closeOfflineCashbookWithOutbox(getOfflineActorContext(), businessDate, payload),
      }),
    onSuccess: async (summary) => {
      await saveLocalCashbookSummary(shopId, businessDate, summary);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashbookKeys.day(businessDate) }),
        queryClient.invalidateQueries({ queryKey: reportsKeys.dashboard() }),
      ]);
    },
  });
}

export function useReopenCashbookMutation(businessDate: string) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReopenCashbookPayload) => cashbookApi.reopen(payload),
    onSuccess: async (summary) => {
      await saveLocalCashbookSummary(shopId, businessDate, summary);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashbookKeys.day(businessDate) }),
        queryClient.invalidateQueries({ queryKey: reportsKeys.dashboard() }),
      ]);
    },
  });
}

export function useCreateManualCashbookEntryMutation(businessDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CreateManualCashbookEntryPayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () => cashbookApi.createManualEntry(input.payload, input.idempotencyKey),
        offlineFn: async () => {
          const ctx = getOfflineActorContext();
          await createOfflineManualCashbookEntryWithOutbox(
            ctx,
            businessDate,
            input.payload,
            input.idempotencyKey,
          );
          const now = input.payload.occurredAt ?? new Date().toISOString();
          return {
            entry: {
              id: input.payload.id ?? businessDate,
              shopId: ctx.shopId,
              sessionId: null,
              direction: (input.payload.entryType === 'OWNER_CASH_IN' ? 'IN' : 'OUT') as
                | 'IN'
                | 'OUT',
              entryType: input.payload.entryType,
              method: input.payload.method,
              amountPoisha: input.payload.amountPoisha,
              referenceType: 'MANUAL',
              referenceId: null,
              referenceNumber: null,
              note: input.payload.note ?? null,
              actorUserId: ctx.userId,
              actorName: ctx.userName,
              occurredAt: now,
              createdAt: now,
            },
            idempotencyReplayed: false,
          };
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashbookKeys.day(businessDate) }),
        queryClient.invalidateQueries({ queryKey: reportsKeys.dashboard() }),
      ]);
    },
  });
}

export function useSalesReportQuery(params: {
  period: SalesReportPeriod;
  from?: string;
  to?: string;
}) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const role = useAuthStore((s) => s.user?.role ?? 'EMPLOYEE');

  return useQuery<{ report: SalesReportResponse; fromOfflineCache: boolean }>({
    queryKey: reportsKeys.sales(params.period, params.from, params.to),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const cacheKey = `sales:${role}:${params.period}:${params.from ?? ''}:${params.to ?? ''}`;
      try {
        const res = await reportsApi.getSalesReport(params);
        await saveLocalReportSnapshot(shopId, cacheKey, res.report);
        return { report: res.report, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalReportSnapshot<SalesReportResponse>(shopId, cacheKey);
          if (cached) {
            return { report: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useProductsReportQuery(params?: { from?: string; to?: string }) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const role = useAuthStore((s) => s.user?.role ?? 'EMPLOYEE');

  return useQuery<{ report: ProductsReportResponse; fromOfflineCache: boolean }>({
    queryKey: reportsKeys.products(params?.from, params?.to),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const cacheKey = `products:${role}:${params?.from ?? ''}:${params?.to ?? ''}`;
      try {
        const res = await reportsApi.getProductsReport({ ...params, limit: 30 });
        await saveLocalReportSnapshot(shopId, cacheKey, res.report);
        return { report: res.report, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalReportSnapshot<ProductsReportResponse>(shopId, cacheKey);
          if (cached) {
            return { report: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useProfitLossReportQuery(params?: { from?: string; to?: string }) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const role = useAuthStore((s) => s.user?.role ?? 'EMPLOYEE');

  return useQuery<{ report: ProfitLossReportResponse; fromOfflineCache: boolean }>({
    queryKey: reportsKeys.profitLoss(params?.from, params?.to),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const cacheKey = `pnl:${params?.from ?? ''}:${params?.to ?? ''}`;
      try {
        const res = await reportsApi.getProfitLossReport(params);
        await saveLocalReportSnapshot(shopId, cacheKey, res.report);
        return { report: res.report, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalReportSnapshot<ProfitLossReportResponse>(shopId, cacheKey);
          if (cached) {
            return { report: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(shopId) && role === 'OWNER',
  });
}

export function useDuesReportQuery() {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');

  return useQuery<{ report: DuesReportResponse; fromOfflineCache: boolean }>({
    queryKey: reportsKeys.dues(),
    queryFn: async () => {
      const cacheKey = 'dues';
      try {
        const res = await reportsApi.getDuesReport();
        await saveLocalReportSnapshot(shopId, cacheKey, res.report);
        return { report: res.report, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalReportSnapshot<DuesReportResponse>(shopId, cacheKey);
          if (cached) {
            return { report: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}
