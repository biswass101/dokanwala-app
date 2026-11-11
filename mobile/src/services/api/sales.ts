import type {
  CustomerDto,
  DiscountType,
  PaymentMethod,
  RefundMethod,
  SaleDto,
  SaleReturnDto,
  SaleStatus,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import { unwrapApiGet, unwrapApiPost } from './client';

export interface CreateCustomerPayload {
  id?: string;
  nameBn: string;
  nameEn?: string | null;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
}

export interface CreateSalePayload {
  id?: string;
  customerId?: string | null;
  items: {
    productId: string;
    unitId: string;
    qtyDisplay: string;
  }[];
  discountType?: DiscountType;
  discountValue?: string | number;
  payments?: {
    method: PaymentMethod;
    amountPoisha: number;
    reference?: string | null;
  }[];
  tenderedPoisha?: number | null;
  note?: string | null;
}

export interface CreateSaleReturnPayload {
  refundMethod: RefundMethod;
  items: {
    saleItemId: string;
    qtyDisplay: string;
  }[];
  reason?: string | null;
}

export interface CancelSalePayload {
  reason: string;
}

export const customersApi = {
  list(params?: {
    q?: string;
    withDuesOnly?: boolean;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ customers: CustomerDto[] }> {
    const query: Record<string, string | number> = {};
    if (params?.q && params.q.trim().length > 0) query.q = params.q.trim();
    if (params?.withDuesOnly) query.withDuesOnly = 'true';
    if (params?.includeInactive) query.includeInactive = 'true';
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/customers', query);
  },

  create(body: CreateCustomerPayload): Promise<{ customer: CustomerDto }> {
    return unwrapApiPost('/customers', body);
  },
};

export const salesApi = {
  list(params?: {
    from?: string;
    to?: string;
    status?: SaleStatus;
    customerId?: string;
    dueOnly?: boolean;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{ sales: SaleDto[] }> {
    const query: Record<string, string | number> = {};
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    if (params?.status) query.status = params.status;
    if (params?.customerId) query.customerId = params.customerId;
    if (params?.dueOnly) query.dueOnly = 'true';
    if (params?.q && params.q.trim().length > 0) query.q = params.q.trim();
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/sales', query);
  },

  get(id: string): Promise<{ sale: SaleDto }> {
    return unwrapApiGet(`/sales/${id}`);
  },

  create(
    body: CreateSalePayload,
    idempotencyKey?: string,
  ): Promise<{ sale: SaleDto; idempotencyReplayed: boolean }> {
    const key = idempotencyKey ?? Crypto.randomUUID();
    return unwrapApiPost('/sales', body, {
      'X-Idempotency-Key': key,
    });
  },

  createReturn(
    saleId: string,
    body: CreateSaleReturnPayload,
    idempotencyKey?: string,
  ): Promise<{ sale: SaleDto; saleReturn: SaleReturnDto; idempotencyReplayed: boolean }> {
    const key = idempotencyKey ?? Crypto.randomUUID();
    return unwrapApiPost(`/sales/${saleId}/returns`, body, {
      'X-Idempotency-Key': key,
    });
  },

  cancel(
    saleId: string,
    body: CancelSalePayload,
    idempotencyKey?: string,
  ): Promise<{ sale: SaleDto; idempotencyReplayed: boolean }> {
    const key = idempotencyKey ?? Crypto.randomUUID();
    return unwrapApiPost(`/sales/${saleId}/cancel`, body, {
      'X-Idempotency-Key': key,
    });
  },
};
