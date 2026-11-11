import type {
  PaymentMethod,
  PurchaseDto,
  PurchaseRefundMethod,
  PurchaseReturnDto,
  PurchaseStatus,
  SupplierDto,
  SupplierLedgerEntryDto,
  SupplierPaymentDto,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import { unwrapApiGet, unwrapApiPatch, unwrapApiPost } from './client';

export interface CreateSupplierPayload {
  id?: string;
  nameBn: string;
  nameEn?: string | null;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
}

export interface UpdateSupplierPayload {
  nameBn?: string;
  nameEn?: string | null;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
  isActive?: boolean;
  confirmWithPayable?: boolean;
  expectedVersion?: number;
}

export interface CreateSupplierPaymentPayload {
  id?: string;
  purchaseId?: string | null;
  method: PaymentMethod;
  amountPoisha: number;
  reference?: string | null;
  note?: string | null;
}

export interface CreatePurchasePayload {
  id?: string;
  supplierId?: string | null;
  items: {
    productId: string;
    unitId: string;
    qtyDisplay: string;
    unitCostPoisha: number;
  }[];
  discountPoisha?: number;
  paidPoisha?: number;
  paymentMethod?: PaymentMethod | null;
  paymentReference?: string | null;
  note?: string | null;
}

export interface CreatePurchaseReturnPayload {
  refundMethod: PurchaseRefundMethod;
  items: {
    purchaseItemId: string;
    qtyDisplay: string;
  }[];
  reason?: string | null;
}

export const suppliersApi = {
  list(params?: {
    q?: string;
    withPayablesOnly?: boolean;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ suppliers: SupplierDto[] }> {
    const query: Record<string, string | number> = {};
    if (params?.q && params.q.trim().length > 0) query.q = params.q.trim();
    if (params?.withPayablesOnly) query.withPayablesOnly = 'true';
    if (params?.includeInactive) query.includeInactive = 'true';
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/suppliers', query);
  },

  create(body: CreateSupplierPayload): Promise<{ supplier: SupplierDto }> {
    return unwrapApiPost('/suppliers', body);
  },

  update(id: string, body: UpdateSupplierPayload): Promise<{ supplier: SupplierDto }> {
    return unwrapApiPatch(`/suppliers/${id}`, body);
  },

  getLedger(
    id: string,
    params?: { from?: string; to?: string; limit?: number },
  ): Promise<{ supplier: SupplierDto; entries: SupplierLedgerEntryDto[] }> {
    const query: Record<string, string | number> = {};
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet(`/suppliers/${id}/ledger`, query);
  },

  createPayment(
    supplierId: string,
    body: CreateSupplierPaymentPayload,
    idempotencyKey?: string,
  ): Promise<{ payment: SupplierPaymentDto; supplier: SupplierDto; idempotencyReplayed: boolean }> {
    const key = idempotencyKey ?? Crypto.randomUUID();
    return unwrapApiPost(`/suppliers/${supplierId}/payments`, body, {
      'X-Idempotency-Key': key,
    });
  },
};

export const purchasesApi = {
  list(params?: {
    from?: string;
    to?: string;
    status?: PurchaseStatus;
    supplierId?: string;
    dueOnly?: boolean;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{ purchases: PurchaseDto[] }> {
    const query: Record<string, string | number> = {};
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    if (params?.status) query.status = params.status;
    if (params?.supplierId) query.supplierId = params.supplierId;
    if (params?.dueOnly) query.dueOnly = 'true';
    if (params?.q && params.q.trim().length > 0) query.q = params.q.trim();
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/purchases', query);
  },

  get(id: string): Promise<{ purchase: PurchaseDto }> {
    return unwrapApiGet(`/purchases/${id}`);
  },

  create(
    body: CreatePurchasePayload,
    idempotencyKey?: string,
  ): Promise<{ purchase: PurchaseDto; idempotencyReplayed: boolean }> {
    const key = idempotencyKey ?? Crypto.randomUUID();
    return unwrapApiPost('/purchases', body, {
      'X-Idempotency-Key': key,
    });
  },

  createReturn(
    purchaseId: string,
    body: CreatePurchaseReturnPayload,
    idempotencyKey?: string,
  ): Promise<{
    purchase: PurchaseDto;
    purchaseReturn: PurchaseReturnDto;
    idempotencyReplayed: boolean;
  }> {
    const key = idempotencyKey ?? Crypto.randomUUID();
    return unwrapApiPost(`/purchases/${purchaseId}/returns`, body, {
      'X-Idempotency-Key': key,
    });
  },
};
