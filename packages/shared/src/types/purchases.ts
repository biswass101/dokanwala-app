import type { PaymentMethod } from '../constants/domain.js';

export const PurchaseStatuses = {
  COMPLETED: 'COMPLETED',
  PARTIALLY_RETURNED: 'PARTIALLY_RETURNED',
  RETURNED: 'RETURNED',
} as const;

export type PurchaseStatus = (typeof PurchaseStatuses)[keyof typeof PurchaseStatuses];

export const PurchaseRefundMethods = {
  CASH: 'CASH',
  BKASH: 'BKASH',
  NAGAD: 'NAGAD',
  OTHER: 'OTHER',
  PAYABLE_ADJUSTMENT: 'PAYABLE_ADJUSTMENT',
} as const;

export type PurchaseRefundMethod =
  (typeof PurchaseRefundMethods)[keyof typeof PurchaseRefundMethods];

export interface SupplierDto {
  id: string;
  shopId: string;
  nameBn: string;
  nameEn: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  totalPurchasedPoisha: number;
  totalPaidPoisha: number;
  payablePoisha: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItemDto {
  id: string;
  purchaseId: string;
  productId: string;
  unitId: string;
  productNameBn: string;
  productNameEn: string | null;
  unitNameBn: string;
  unitNameEn: string;
  lineOrder: number;
  qtyDisplay: string;
  conversionFactorToBase: string;
  qtyBase: string;
  returnedQtyBase: string;
  unitCostPoisha: number;
  lineTotalPoisha: number;
  netCostPoisha: number;
}

export interface PurchaseReturnItemDto {
  id: string;
  purchaseReturnId: string;
  purchaseItemId: string;
  productId: string;
  productNameBn: string;
  productNameEn: string | null;
  unitNameBn: string;
  unitNameEn: string;
  qtyDisplay: string;
  qtyBase: string;
  unitCostPoisha: number;
  lineRefundPoisha: number;
  reversedCostPoisha: number;
}

export interface PurchaseReturnDto {
  id: string;
  purchaseId: string;
  returnNumber: string;
  refundMethod: PurchaseRefundMethod;
  subtotalPoisha: number;
  discountAdjustmentPoisha: number;
  refundTotalPoisha: number;
  cashRefundPoisha: number;
  payableAdjustedPoisha: number;
  reason: string | null;
  actorUserId: string | null;
  actorName: string | null;
  returnedAt: string;
  items: PurchaseReturnItemDto[];
}

export interface PurchaseDto {
  id: string;
  shopId: string;
  purchaseNumber: string;
  supplierId: string | null;
  supplierNameSnapshot: string | null;
  status: PurchaseStatus;
  subtotalPoisha: number;
  discountPoisha: number;
  totalPoisha: number;
  paidPoisha: number;
  settledDuePoisha: number;
  duePoisha: number;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  returnedTotalPoisha: number;
  cashRefundedPoisha: number;
  note: string | null;
  actorUserId: string | null;
  actorName: string | null;
  purchasedAt: string;
  createdAt: string;
  updatedAt: string;
  items: PurchaseItemDto[];
  returns: PurchaseReturnDto[];
}

export interface SupplierPaymentDto {
  id: string;
  shopId: string;
  supplierId: string;
  purchaseId: string | null;
  method: PaymentMethod;
  amountPoisha: number;
  reference: string | null;
  note: string | null;
  actorUserId: string | null;
  actorName: string | null;
  paidAt: string;
  createdAt: string;
}

export const SupplierLedgerEntryTypes = {
  PURCHASE: 'PURCHASE',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT',
} as const;

export type SupplierLedgerEntryType =
  (typeof SupplierLedgerEntryTypes)[keyof typeof SupplierLedgerEntryTypes];

export interface SupplierLedgerEntryDto {
  id: string;
  type: SupplierLedgerEntryType;
  referenceId: string;
  referenceNumber: string | null;
  occurredAt: string;
  totalPoisha: number;
  paidOrRefundedPoisha: number;
  payableDeltaPoisha: number;
  runningPayablePoisha: number;
  method: PaymentMethod | PurchaseRefundMethod | null;
  note: string | null;
}
