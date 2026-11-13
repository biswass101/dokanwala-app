import type { PaymentMethod } from '../constants/domain.js';

export const CashbookSessionStatuses = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type CashbookSessionStatus =
  (typeof CashbookSessionStatuses)[keyof typeof CashbookSessionStatuses];

export const CashbookDirections = {
  IN: 'IN',
  OUT: 'OUT',
} as const;

export type CashbookDirection = (typeof CashbookDirections)[keyof typeof CashbookDirections];

export const CashbookEntryTypes = {
  SALE_IN: 'SALE_IN',
  DUE_COLLECTION_IN: 'DUE_COLLECTION_IN',
  PURCHASE_REFUND_IN: 'PURCHASE_REFUND_IN',
  OWNER_CASH_IN: 'OWNER_CASH_IN',
  EXPENSE_ADJUST_IN: 'EXPENSE_ADJUST_IN',
  SALE_REFUND_OUT: 'SALE_REFUND_OUT',
  SALE_CANCEL_OUT: 'SALE_CANCEL_OUT',
  PURCHASE_OUT: 'PURCHASE_OUT',
  SUPPLIER_PAYMENT_OUT: 'SUPPLIER_PAYMENT_OUT',
  EXPENSE_OUT: 'EXPENSE_OUT',
  EXPENSE_ADJUST_OUT: 'EXPENSE_ADJUST_OUT',
  OWNER_DRAWING_OUT: 'OWNER_DRAWING_OUT',
} as const;

export type CashbookEntryType = (typeof CashbookEntryTypes)[keyof typeof CashbookEntryTypes];

export type ManualCashbookEntryType = 'OWNER_CASH_IN' | 'OWNER_DRAWING_OUT';

export interface CashbookEntryDto {
  id: string;
  shopId: string;
  sessionId: string | null;
  direction: CashbookDirection;
  entryType: CashbookEntryType;
  method: PaymentMethod;
  amountPoisha: number;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  note: string | null;
  actorUserId: string | null;
  actorName: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface CashbookMethodTotalsDto {
  cashInPoisha: number;
  cashOutPoisha: number;
  netCashPoisha: number;
  bkashInPoisha: number;
  bkashOutPoisha: number;
  netBkashPoisha: number;
  nagadInPoisha: number;
  nagadOutPoisha: number;
  netNagadPoisha: number;
  otherInPoisha: number;
  otherOutPoisha: number;
  netOtherPoisha: number;
  totalInPoisha: number;
  totalOutPoisha: number;
  netAllMethodsPoisha: number;
}

export interface CashbookSessionDto {
  id: string;
  shopId: string;
  businessDate: string;
  status: CashbookSessionStatus;
  openingCashPoisha: number;
  expectedClosingCashPoisha: number;
  actualClosingCashPoisha: number | null;
  variancePoisha: number | null;
  note: string | null;
  openedByUserId: string | null;
  openedByName: string | null;
  closedByUserId: string | null;
  closedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CashbookSummaryResponse {
  businessDate: string;
  session: CashbookSessionDto | null;
  totals: CashbookMethodTotalsDto;
  liveExpectedClosingCashPoisha: number;
  previousClosedCashPoisha: number | null;
  entries: CashbookEntryDto[];
}

export type RecentDashboardTransactionKind =
  | 'SALE'
  | 'PURCHASE'
  | 'EXPENSE'
  | 'CUSTOMER_PAYMENT'
  | 'SUPPLIER_PAYMENT';

export interface RecentDashboardTransactionDto {
  id: string;
  kind: RecentDashboardTransactionKind;
  title: string;
  subtitle: string | null;
  amountPoisha: number;
  direction: CashbookDirection;
  occurredAt: string;
  referenceId: string;
}

export type DashboardPeriod = 'day' | 'week' | 'month';

export interface DashboardComparisonItemDto {
  currentPoisha: number;
  previousPoisha: number;
  diffPoisha: number;
  growthPercent: number | null;
}

export interface DashboardComparisonMetricsDto {
  sales: DashboardComparisonItemDto;
  salesCount: {
    current: number;
    previous: number;
    diff: number;
    growthPercent: number | null;
  };
  expenses: DashboardComparisonItemDto;
  grossProfit: DashboardComparisonItemDto | null;
  netProfit: DashboardComparisonItemDto | null;
  cashReceived: DashboardComparisonItemDto;
  creditGiven: DashboardComparisonItemDto;
}

export interface DashboardChartPointDto {
  key: string;
  label: string;
  currentPoisha: number;
  previousPoisha: number;
  currentCount: number;
  previousCount: number;
}

export interface DashboardPaymentDistributionDto {
  cashPoisha: number;
  bkashPoisha: number;
  nagadPoisha: number;
  otherPoisha: number;
  creditPoisha: number;
}

export interface DashboardSummaryResponse {
  businessDate: string;
  todaySalesPoisha: number;
  todaySalesCount: number;
  todayReturnsPoisha: number;
  todayNetSalesPoisha: number;
  todayCogsPoisha: number | null;
  todayGrossProfitPoisha: number | null;
  todayWastageLossPoisha: number | null;
  todayExpensesPoisha: number;
  todayNetProfitPoisha: number | null;
  todayCashReceivedPoisha: number;
  todayDueGivenPoisha: number;
  todayDueCollectedPoisha: number;
  totalProducts: number;
  lowStockCount: number;
  customerDueTotalPoisha: number;
  supplierPayableTotalPoisha: number;
  cashbookStatus: CashbookSessionStatus | 'UNOPENED';
  cashbookExpectedCashPoisha: number;
  recentTransactions: RecentDashboardTransactionDto[];
  period?: DashboardPeriod;
  periodLabel?: string;
  comparisonLabel?: string;
  fromDate?: string;
  toDate?: string;
  comparison?: DashboardComparisonMetricsDto;
  chartSeries?: DashboardChartPointDto[];
  paymentDistribution?: DashboardPaymentDistributionDto;
}

export type SalesReportPeriod = 'daily' | 'weekly' | 'monthly';

export interface SalesReportBucketDto {
  bucketKey: string;
  label: string;
  salesCount: number;
  grossSalesPoisha: number;
  discountsPoisha: number;
  returnsPoisha: number;
  netSalesPoisha: number;
  cashAndMfsReceivedPoisha: number;
  creditIssuedPoisha: number;
  cogsPoisha: number | null;
  grossProfitPoisha: number | null;
}

export interface SalesReportResponse {
  period: SalesReportPeriod;
  fromDate: string;
  toDate: string;
  totals: {
    salesCount: number;
    grossSalesPoisha: number;
    discountsPoisha: number;
    returnsPoisha: number;
    netSalesPoisha: number;
    cashAndMfsReceivedPoisha: number;
    creditIssuedPoisha: number;
    dueCollectedPoisha: number;
    cogsPoisha: number | null;
    grossProfitPoisha: number | null;
  };
  paymentBreakdown: {
    cashPoisha: number;
    bkashPoisha: number;
    nagadPoisha: number;
    otherPoisha: number;
  };
  buckets: SalesReportBucketDto[];
}

export interface ProductPerformanceItemDto {
  productId: string;
  productNameBn: string;
  productNameEn: string | null;
  baseUnitNameBn: string;
  soldQtyBase: string;
  returnedQtyBase: string;
  netQtyBase: string;
  grossRevenuePoisha: number;
  returnedRevenuePoisha: number;
  netRevenuePoisha: number;
  netCogsPoisha: number | null;
  grossProfitPoisha: number | null;
}

export interface ProductsReportResponse {
  fromDate: string;
  toDate: string;
  totalGrossItemRevenuePoisha: number;
  totalReturnedItemRevenuePoisha: number;
  totalNetItemRevenuePoisha: number;
  totalInvoiceDiscountsNetPoisha: number;
  totalNetSalesPoisha: number;
  totalNetCogsPoisha: number | null;
  totalGrossProfitPoisha: number | null;
  items: ProductPerformanceItemDto[];
}

export interface ProfitLossExpenseCategoryDto {
  categoryId: string;
  categoryNameBn: string;
  amountPoisha: number;
}

export interface ProfitLossReportResponse {
  fromDate: string;
  toDate: string;
  grossSalesPoisha: number;
  discountsPoisha: number;
  salesReturnsPoisha: number;
  netSalesPoisha: number;
  grossCogsPoisha: number;
  restoredCogsPoisha: number;
  netCogsPoisha: number;
  grossProfitPoisha: number;
  wastageLossPoisha: number;
  damageLossPoisha: number;
  expiredLossPoisha: number;
  countShrinkageLossPoisha: number;
  totalInventoryLossPoisha: number;
  totalOperatingExpensesPoisha: number;
  expensesByCategory: ProfitLossExpenseCategoryDto[];
  netProfitPoisha: number;
  purchasesSummary: {
    purchaseCount: number;
    grossPurchasesPoisha: number;
    purchaseDiscountsPoisha: number;
    purchaseReturnsPoisha: number;
    netPurchasesPoisha: number;
    cashPaidToSuppliersPoisha: number;
  };
}

export interface CustomerDueReportItemDto {
  customerId: string;
  nameBn: string;
  nameEn: string | null;
  phone: string | null;
  totalPurchasedPoisha: number;
  totalPaidPoisha: number;
  duePoisha: number;
}

export interface SupplierPayableReportItemDto {
  supplierId: string;
  nameBn: string;
  nameEn: string | null;
  phone: string | null;
  totalPurchasedPoisha: number;
  totalPaidPoisha: number;
  payablePoisha: number;
}

export interface DuesReportResponse {
  totalCustomerDuePoisha: number;
  customersWithDueCount: number;
  customers: CustomerDueReportItemDto[];
  totalSupplierPayablePoisha: number;
  suppliersWithPayableCount: number;
  suppliers: SupplierPayableReportItemDto[];
}
