import type { CustomerDto, CustomerLedgerEntryDto } from '@dokanwala/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadLocalCustomerLedger,
  saveLocalCustomerLedger,
} from '@/database/repositories/customers-expenses-local.repo';
import {
  collectOfflineCustomerPaymentWithOutbox,
  updateOfflineCustomerWithOutbox,
} from '@/database/repositories/offline-writes.repo';
import { upsertLocalCustomer } from '@/database/repositories/sales-local.repo';
import { salesKeys } from '@/features/sales/hooks/useSalesQueries';
import { ApiClientError } from '@/services/api/client';
import {
  customersApi,
  type CreateCustomerPaymentPayload,
  type UpdateCustomerPayload,
} from '@/services/api/sales';
import {
  executeOnlineOrOffline,
  getOfflineActorContext,
} from '@/services/sync/offline-mutation-helper';
import { useAuthStore } from '@/store/auth.store';

export const customersKeys = {
  all: ['customers'] as const,
  ledger: (id: string) => ['customers', 'ledger', id] as const,
};

function isNetworkFailure(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === 'NETWORK_ERROR';
}

export function useCustomerLedgerQuery(customerId: string | undefined) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');

  return useQuery<{
    customer: CustomerDto;
    entries: CustomerLedgerEntryDto[];
    fromOfflineCache: boolean;
  }>({
    queryKey: customersKeys.ledger(customerId ?? ''),
    queryFn: async () => {
      if (!customerId) {
        throw new Error('Customer ID missing');
      }
      try {
        const res = await customersApi.getLedger(customerId, { limit: 200 });
        await saveLocalCustomerLedger(res.customer, res.entries);
        return {
          customer: res.customer,
          entries: res.entries,
          fromOfflineCache: false,
        };
      } catch (err) {
        if (isNetworkFailure(err)) {
          const cached = await loadLocalCustomerLedger(customerId);
          if (cached) {
            return {
              customer: cached.customer,
              entries: cached.entries,
              fromOfflineCache: true,
            };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(customerId) && Boolean(shopId),
  });
}

export function useUpdateCustomerMutation(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCustomerPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => customersApi.update(customerId, payload),
        offlineFn: async () => ({
          customer: await updateOfflineCustomerWithOutbox(
            getOfflineActorContext(),
            customerId,
            payload,
          ),
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalCustomer(res.customer);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.customersAll }),
        queryClient.invalidateQueries({ queryKey: customersKeys.ledger(customerId) }),
      ]);
    },
  });
}

export function useCollectCustomerPaymentMutation(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { payload: CreateCustomerPaymentPayload; idempotencyKey?: string }) =>
      executeOnlineOrOffline({
        onlineFn: () =>
          customersApi.collectPayment(customerId, input.payload, input.idempotencyKey),
        offlineFn: async () => {
          const ctx = getOfflineActorContext();
          const customer = await collectOfflineCustomerPaymentWithOutbox(
            ctx,
            customerId,
            input.payload,
            input.idempotencyKey,
          );
          const now = new Date().toISOString();
          return {
            payment: {
              id: input.payload.id ?? customer.id,
              shopId: ctx.shopId,
              customerId,
              saleId: input.payload.saleId ?? null,
              method: input.payload.method,
              amountPoisha: input.payload.amountPoisha,
              reference: input.payload.reference ?? null,
              note: input.payload.note ?? null,
              actorUserId: ctx.userId,
              actorName: ctx.userName,
              paidAt: input.payload.paidAt ?? now,
              createdAt: now,
            },
            customer,
            idempotencyReplayed: false,
          };
        },
      }),
    onSuccess: async (res) => {
      await upsertLocalCustomer(res.customer);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.customersAll }),
        queryClient.invalidateQueries({ queryKey: customersKeys.ledger(customerId) }),
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['cashbook'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
}
