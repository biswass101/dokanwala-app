import type { CustomerDto, CustomerLedgerEntryDto } from '@dokanwala/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadLocalCustomerLedger,
  saveLocalCustomerLedger,
} from '@/database/repositories/customers-expenses-local.repo';
import { upsertLocalCustomer } from '@/database/repositories/sales-local.repo';
import { salesKeys } from '@/features/sales/hooks/useSalesQueries';
import { ApiClientError } from '@/services/api/client';
import {
  customersApi,
  type CreateCustomerPaymentPayload,
  type UpdateCustomerPayload,
} from '@/services/api/sales';
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
    mutationFn: (payload: UpdateCustomerPayload) => customersApi.update(customerId, payload),
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
      customersApi.collectPayment(customerId, input.payload, input.idempotencyKey),
    onSuccess: async (res) => {
      await upsertLocalCustomer(res.customer);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.customersAll }),
        queryClient.invalidateQueries({ queryKey: customersKeys.ledger(customerId) }),
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
      ]);
    },
  });
}
