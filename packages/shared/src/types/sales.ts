import type { PaymentMethod } from '../constants/domain.js';

export const SaleStatuses = {
  COMPLETED: 'COMPLETED',
  PARTIALLY_RETURNED: 'PARTIALLY_RETURNED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
} as const;

export type SaleStatus = (typeof SaleStatuses)[keyof typeof SaleStatuses];

export const DiscountTypes = {
  FIXED_POISHA: 'FIXED_POISHA',
  PERCENT: 'PERCENT',
} as const;

export type DiscountType = (typeof DiscountTypes)[keyof typeof DiscountTypes];

export const RefundMethods = {
  CASH: 'CASH',
  BKASH: 'BKASH',
  NAGAD: 'NAGAD',
  OTHER: 'OTHER',
  CREDIT_ADJUSTMENT: 'CREDIT_ADJUSTMENT',
} as const;

export type RefundMethod = (typeof RefundMethods)[keyof typeof RefundMethods];

export interface CustomerDto {
  id: string;
  shopId: string;
  nameBn: string;
  nameEn: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  totalPurchasedPoisha: number;
  totalPaidPoisha: number;
  duePoisha: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItemDto {
  id: string;
  saleId: string;
  productId: string;
  unitId: string;
  productNameBn: string;
  productNameEn: string | null;
  unitNameBn: string;
  unitNameEn: string;
  qtyDisplay: string;
  conversionFactorToBase: string;
  qtyBase: string;
  returnedQtyBase: string;
  unitSellingPricePoisha: number;
  /**
   * Hidden (`null`) for EMPLOYEE accounts to protect wholesale margins.
   */
  unitCostAtSaleBdt: string | null;
  lineSubtotalPoisha: number;
  /**
   * Hidden (`null`) for EMPLOYEE accounts.
   */
  lineCogsPoisha: number | null;
}

export interface PaymentDto {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amountPoisha: number;
  reference: string | null;
  receivedAt: string;
}

export interface SaleReturnItemDto {
  id: string;
  saleReturnId: string;
  saleItemId: string;
  productId: string;
  productNameBn: string;
  productNameEn: string | null;
  unitNameBn: string;
  unitNameEn: string;
  qtyDisplay: string;
  qtyBase: string;
  unitSellingPricePoisha: number;
  lineRefundPoisha: number;
  /**
   * Hidden (`null`) for EMPLOYEE accounts.
   */
  restoredCogsPoisha: number | null;
}

export interface SaleReturnDto {
  id: string;
  saleId: string;
  returnNumber: string;
  refundMethod: RefundMethod;
  subtotalPoisha: number;
  discountAdjustmentPoisha: number;
  refundTotalPoisha: number;
  cashRefundPoisha: number;
  creditAdjustedPoisha: number;
  reason: string | null;
  actorUserId: string | null;
  actorName: string | null;
  returnedAt: string;
  items: SaleReturnItemDto[];
}

export interface SaleDto {
  id: string;
  shopId: string;
  receiptNumber: string;
  customerId: string | null;
  customerNameSnapshot: string | null;
  status: SaleStatus;
  subtotalPoisha: number;
  discountType: DiscountType;
  discountValue: string;
  discountPoisha: number;
  totalPoisha: number;
  paidPoisha: number;
  settledDuePoisha: number;
  duePoisha: number;
  tenderedPoisha: number | null;
  changePoisha: number;
  returnedTotalPoisha: number;
  cashRefundedPoisha: number;
  /**
   * Hidden (`null`) for EMPLOYEE accounts.
   */
  cogsPoisha: number | null;
  /**
   * Net revenue minus COGS; hidden (`null`) for EMPLOYEE accounts.
   */
  estimatedProfitPoisha: number | null;
  note: string | null;
  actorUserId: string | null;
  actorName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  soldAt: string;
  createdAt: string;
  updatedAt: string;
  items: SaleItemDto[];
  payments: PaymentDto[];
  returns: SaleReturnDto[];
}

export interface UpdateSaleDto {
  soldAt?: string;
  note?: string | null;
  customerId?: string | null;
}

export interface CreateQuickSaleDto {
  id?: string;
  totalSellingPricePoisha: number;
  quantity?: number | string;
  note?: string | null;
  soldAt?: string;
  paymentMethod?: PaymentMethod;
  paidPoisha?: number;
  customerId?: string | null;
  productId?: string | null;
  unitId?: string | null;
}

