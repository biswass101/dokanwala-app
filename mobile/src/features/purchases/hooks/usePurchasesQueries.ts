import type {
  PurchaseDto,
  PurchaseStatus,
  SupplierDto,
  SupplierLedgerEntryDto,
} from '@dokanwala/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createOfflinePurchaseReturnWithOutbox,
  createOfflinePurchaseWithOutbox,
  createOfflineSupplierPaymentWithOutbox,
  createOfflineSupplierWithOutbox,
  updateOfflineSupplierWithOutbox,
} from '@/database/repositories/offline-writes.repo';
import {
  loadLocalPurchaseById,
  loadLocalPurchases,
  loadLocalSupplierLedger,
  loadLocalSuppliers,
  replaceLocalPurchases,
  saveLocalSupplierLedger,
  saveLocalSuppliers,
  upsertLocalPurchase,
  upsertLocalSupplier,
} from '@/database/repositories/purchases-local.repo';
import { ApiClientError } from '@/services/api/client';
import {
  purchasesApi,
  suppliersApi,
  type CreatePurchasePayload,
  type CreatePurchaseReturnPayload,
  type CreateSupplierPayload,
  type CreateSupplierPaymentPayload,
  type UpdateSupplierPayload,
} from '@/services/api/purchases';
import {
  executeOnlineOrOffline,
  getOfflineActorContext,
} from '@/services/sync/offline-mutation-helper';
import { useAuthStore } from '@/store/auth.store';

export const purchasesKeys = {
  all: ['purchases'] as const,
  list: (params: {
    status?: PurchaseStatus;
    dueOnly?: boolean;
    q?: string;
    supplierId?: string;
    from?: string;
    to?: string;
  }) => ['purchases', 'list', params] as const,
  detail: (id: string) => ['purchases', 'detail', id] as const,
  suppliersAll: ['suppliers'] as const,
  suppliersList: (params: { q?: string; withPayablesOnly?: boolean }) =>
    ['suppliers', 'list', params] as const,
  supplierLedger: (id: string) => ['suppliers', 'ledger', id] as const,
};

function isNetworkFailure(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === 'NETWORK_ERROR';
}

export function useSuppliersQuery(params?: { q?: string; withPayablesOnly?: boolean }) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const role = useAuthStore((s) => s.user?.role);
  const normalized = {
    ...(params?.q && params.q.trim().length > 0 ? { q: params.q.trim() } : {}),
    ...(params?.withPayablesOnly ? { withPayablesOnly: true } : {}),
  };
  const isUnfiltered = !normalized.q && !normalized.withPayablesOnly;

  return useQuery<{ suppliers: SupplierDto[]; fromOfflineCache: boolean }>({
    queryKey: purchasesKeys.suppliersList(normalized),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await suppliersApi.list({ ...normalized, limit: 100 });
        if (isUnfiltered) {
          await saveLocalSuppliers(res.suppliers);
        }
        return { suppliers: res.suppliers, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalSuppliers(shopId, normalized);
          return { suppliers: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId) && role === 'OWNER',
  });
}

export function useSupplierLedgerQuery(supplierId: string | undefined) {
  const role = useAuthStore((s) => s.user?.role);

  return useQuery<{
    supplier: SupplierDto;
    entries: SupplierLedgerEntryDto[];
    fromOfflineCache: boolean;
  }>({
    queryKey: purchasesKeys.supplierLedger(supplierId ?? ''),
    queryFn: async () => {
      if (!supplierId) {
        throw new Error('Supplier ID missing');
      }
      try {
        const res = await suppliersApi.getLedger(supplierId, { limit: 200 });
        await saveLocalSupplierLedger(res.supplier, res.entries);
        return { supplier: res.supplier, entries: res.entries, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err)) {
          const cached = await loadLocalSupplierLedger(supplierId);
          if (cached) {
            return {
              supplier: cached.supplier,
              entries: cached.entries,
              fromOfflineCache: true,
            };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(supplierId) && role === 'OWNER',
  });
}

export function useCreateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSupplierPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => suppliersApi.create(payload),
        offlineFn: async () => ({
          supplier: await createOfflineSupplierWithOutbox(getOfflineActorContext(), payload),
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalSupplier(res.supplier);
      await queryClient.invalidateQueries({ queryKey: purchasesKeys.suppliersAll });
    },
  });
}

export function useUpdateSupplierMutation(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateSupplierPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => suppliersApi.update(supplierId, payload),
        offlineFn: async () => ({
          supplier: await updateOfflineSupplierWithOutbox(
            getOfflineActorContext(),
            supplierId,
            payload,
          ),
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalSupplier(res.supplier);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchasesKeys.suppliersAll }),
        queryClient.invalidateQueries({ queryKey: purchasesKeys.supplierLedger(supplierId) }),
      ]);
    },
  });
}

export function useCreateSupplierPaymentMutation(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CreateSupplierPaymentPayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () =>
          suppliersApi.createPayment(supplierId, input.payload, input.idempotencyKey),
        offlineFn: async () => {
          const ctx = getOfflineActorContext();
          const supplier = await createOfflineSupplierPaymentWithOutbox(
            ctx,
            supplierId,
            input.payload,
            input.idempotencyKey,
          );
          const now = new Date().toISOString();
          return {
            payment: {
              id: input.payload.id ?? supplier.id,
              shopId: ctx.shopId,
              supplierId,
              purchaseId: input.payload.purchaseId ?? null,
              method: input.payload.method,
              amountPoisha: input.payload.amountPoisha,
              reference: input.payload.reference ?? null,
              note: input.payload.note ?? null,
              actorUserId: ctx.userId,
              actorName: ctx.userName,
              paidAt: now,
              createdAt: now,
            },
            supplier,
            idempotencyReplayed: false,
          };
        },
      }),
    onSuccess: async (res) => {
      await upsertLocalSupplier(res.supplier);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchasesKeys.suppliersAll }),
        queryClient.invalidateQueries({ queryKey: purchasesKeys.supplierLedger(supplierId) }),
        queryClient.invalidateQueries({ queryKey: purchasesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}

export function usePurchasesQuery(params?: {
  status?: PurchaseStatus;
  dueOnly?: boolean;
  q?: string;
  supplierId?: string;
  from?: string;
  to?: string;
}) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const role = useAuthStore((s) => s.user?.role);

  const normalized = {
    ...(params?.status ? { status: params.status } : {}),
    ...(params?.dueOnly ? { dueOnly: true } : {}),
    ...(params?.q && params.q.trim().length > 0 ? { q: params.q.trim() } : {}),
    ...(params?.supplierId ? { supplierId: params.supplierId } : {}),
    ...(params?.from ? { from: params.from } : {}),
    ...(params?.to ? { to: params.to } : {}),
  };

  const isUnfiltered =
    !normalized.status &&
    !normalized.dueOnly &&
    !normalized.q &&
    !normalized.supplierId &&
    !normalized.from &&
    !normalized.to;

  return useQuery<{ purchases: PurchaseDto[]; fromOfflineCache: boolean }>({
    queryKey: purchasesKeys.list(normalized),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await purchasesApi.list({ ...normalized, limit: 50 });
        if (isUnfiltered) {
          await replaceLocalPurchases(res.purchases);
        }
        return { purchases: res.purchases, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalPurchases(shopId, {
            ...(normalized.status ? { status: normalized.status } : {}),
            ...(normalized.dueOnly ? { dueOnly: true } : {}),
            ...(normalized.supplierId ? { supplierId: normalized.supplierId } : {}),
            ...(normalized.q ? { q: normalized.q } : {}),
          });
          return { purchases: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId) && role === 'OWNER',
  });
}

export function usePurchaseDetailQuery(purchaseId: string | undefined) {
  const role = useAuthStore((s) => s.user?.role);

  return useQuery<{ purchase: PurchaseDto; fromOfflineCache: boolean }>({
    queryKey: purchasesKeys.detail(purchaseId ?? ''),
    queryFn: async () => {
      if (!purchaseId) {
        throw new Error('Purchase ID missing');
      }
      try {
        const res = await purchasesApi.get(purchaseId);
        await upsertLocalPurchase(res.purchase);
        return { purchase: res.purchase, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err)) {
          const cached = await loadLocalPurchaseById(purchaseId);
          if (cached) {
            return { purchase: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(purchaseId) && role === 'OWNER',
  });
}

export function useCreatePurchaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CreatePurchasePayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () => purchasesApi.create(input.payload, input.idempotencyKey),
        offlineFn: async () => ({
          purchase: await createOfflinePurchaseWithOutbox(
            getOfflineActorContext(),
            input.payload,
            input.idempotencyKey,
          ),
          idempotencyReplayed: false,
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalPurchase(res.purchase);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchasesKeys.all }),
        queryClient.invalidateQueries({ queryKey: purchasesKeys.suppliersAll }),
        ...(res.purchase.supplierId
          ? [
              queryClient.invalidateQueries({
                queryKey: purchasesKeys.supplierLedger(res.purchase.supplierId),
              }),
            ]
          : []),
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}

export function useCreatePurchaseReturnMutation(purchaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CreatePurchaseReturnPayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () => purchasesApi.createReturn(purchaseId, input.payload, input.idempotencyKey),
        offlineFn: async () => {
          const ctx = getOfflineActorContext();
          const purchase = await createOfflinePurchaseReturnWithOutbox(
            ctx,
            purchaseId,
            input.payload,
            input.idempotencyKey,
          );
          const now = new Date().toISOString();
          return {
            purchase,
            purchaseReturn: {
              id: purchase.id,
              purchaseId: purchase.id,
              returnNumber: 'OFF-PRET',
              refundMethod: input.payload.refundMethod,
              subtotalPoisha: 0,
              discountAdjustmentPoisha: 0,
              refundTotalPoisha: 0,
              cashRefundPoisha: 0,
              payableAdjustedPoisha: 0,
              reason: input.payload.reason ?? null,
              actorUserId: ctx.userId,
              actorName: ctx.userName,
              returnedAt: now,
              items: [],
            },
            idempotencyReplayed: false,
          };
        },
      }),
    onSuccess: async (res) => {
      await upsertLocalPurchase(res.purchase);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchasesKeys.all }),
        queryClient.invalidateQueries({ queryKey: purchasesKeys.suppliersAll }),
        ...(res.purchase.supplierId
          ? [
              queryClient.invalidateQueries({
                queryKey: purchasesKeys.supplierLedger(res.purchase.supplierId),
              }),
            ]
          : []),
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}
