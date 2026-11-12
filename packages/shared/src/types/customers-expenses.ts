import type { PaymentMethod } from '../constants/domain.js';
import type { RefundMethod } from './sales.js';

export interface CustomerPaymentDto {
  id: string;
  shopId: string;
  customerId: string;
  saleId: string | null;
  method: PaymentMethod;
  amountPoisha: number;
  reference: string | null;
  note: string | null;
  actorUserId: string | null;
  actorName: string | null;
  paidAt: string;
  createdAt: string;
}

export const CustomerLedgerEntryTypes = {
  SALE: 'SALE',
  SALE_RETURN: 'SALE_RETURN',
  SALE_CANCEL: 'SALE_CANCEL',
  CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
} as const;

export type CustomerLedgerEntryType =
  (typeof CustomerLedgerEntryTypes)[keyof typeof CustomerLedgerEntryTypes];

export interface CustomerLedgerEntryDto {
  id: string;
  type: CustomerLedgerEntryType;
  referenceId: string;
  referenceNumber: string | null;
  occurredAt: string;
  totalPoisha: number;
  paidOrRefundedPoisha: number;
  dueDeltaPoisha: number;
  runningDuePoisha: number;
  method: PaymentMethod | RefundMethod | null;
  note: string | null;
}

export interface ExpenseCategoryDto {
  id: string;
  shopId: string;
  nameBn: string;
  nameEn: string | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseDto {
  id: string;
  shopId: string;
  categoryId: string;
  categoryNameBn: string;
  categoryNameEn: string | null;
  amountPoisha: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  incurredAt: string;
  actorUserId: string | null;
  actorName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const ExpenseAuditActions = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
} as const;

export type ExpenseAuditAction = (typeof ExpenseAuditActions)[keyof typeof ExpenseAuditActions];

export interface ExpenseAuditSnapshot {
  categoryId: string;
  categoryNameBn: string;
  amountPoisha: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  incurredAt: string;
}

export interface ExpenseAuditLogDto {
  id: string;
  shopId: string;
  expenseId: string;
  action: ExpenseAuditAction;
  editedById: string | null;
  editedByName: string | null;
  beforeJson: ExpenseAuditSnapshot | null;
  afterJson: ExpenseAuditSnapshot;
  reason: string | null;
  occurredAt: string;
}
