export type ReportExportKind = 'sales' | 'profit-loss' | 'products' | 'dues';
export type ReportExportFormat = 'csv' | 'pdf';
export type ReportExportLang = 'bn' | 'en';

export interface BackupShopSnapshot {
  nameBn: string;
  nameEn: string | null;
  addressBn: string | null;
  addressEn: string | null;
  phone: string | null;
  logoUrl: string | null;
  currencyCode: string;
  timezone: string;
  defaultLanguage: 'bn' | 'en';
  defaultDigitStyle: 'bn' | 'en';
  receiptHeaderBn: string | null;
  receiptFooterBn: string | null;
  allowNegativeStock: boolean;
  employeeCanGiveCredit: boolean;
  employeeMaxDiscountPercent: number;
}

export interface BackupCategoryRecord {
  id: string;
  nameBn: string;
  nameEn: string | null;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupUnitRecord {
  id: string;
  code: string;
  nameBn: string;
  nameEn: string;
  isFractional: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupProductRecord {
  id: string;
  categoryId: string | null;
  nameBn: string;
  nameEn: string | null;
  barcode: string | null;
  imageUrl: string | null;
  defaultSupplierName: string | null;
  baseUnitId: string;
  defaultSaleUnitId: string;
  defaultPurchaseUnitId: string;
  baseSellingPricePoisha: number;
  lastPurchasePricePoisha: number;
  lowStockThresholdBase: string;
  isActive: boolean;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupProductUnitRecord {
  id: string;
  productId: string;
  unitId: string;
  conversionFactorToBase: string;
  sellingPricePoisha: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupInventoryBalanceRecord {
  productId: string;
  qtyBase: string;
  avgCostPerBaseBdt: string;
  version: number;
  updatedAt: string;
}

export interface BackupStockMovementRecord {
  id: string;
  productId: string;
  movementType:
    | 'OPENING_STOCK'
    | 'PURCHASE_IN'
    | 'SALE_OUT'
    | 'RETURN_IN'
    | 'PURCHASE_RETURN_OUT'
    | 'COUNT_ADJUST'
    | 'WASTAGE_OUT'
    | 'DAMAGE_OUT'
    | 'EXPIRED_OUT';
  deltaQtyBase: string;
  balanceAfterBase: string;
  unitCostBdt: string;
  valuePoisha: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface BackupStockAdjustmentRecord {
  id: string;
  productId: string;
  adjustmentType: 'COUNT_ADJUST' | 'WASTAGE' | 'DAMAGE' | 'EXPIRED';
  qtyBase: string;
  deltaQtyBase: string;
  unitCostBdt: string;
  lossPoisha: number;
  reason: string | null;
  idempotencyKey: string | null;
  actorUserId: string | null;
  adjustedAt: string;
}

export interface BackupCustomerRecord {
  id: string;
  nameBn: string;
  nameEn: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  totalPurchasedPoisha: number;
  totalPaidPoisha: number;
  duePoisha: number;
  isActive: boolean;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSupplierRecord {
  id: string;
  nameBn: string;
  nameEn: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  totalPurchasedPoisha: number;
  totalPaidPoisha: number;
  payablePoisha: number;
  isActive: boolean;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSaleRecord {
  id: string;
  receiptNumber: string;
  customerId: string | null;
  customerNameSnapshot: string | null;
  status: 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED' | 'CANCELLED';
  subtotalPoisha: number;
  discountType: 'FIXED_POISHA' | 'PERCENT';
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
  cogsPoisha: number;
  note: string | null;
  idempotencyKey: string | null;
  cancelIdempotencyKey: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  actorUserId: string | null;
  soldAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSaleItemRecord {
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
  unitCostAtSaleBdt: string;
  lineSubtotalPoisha: number;
  lineCogsPoisha: number;
  createdAt: string;
}

export interface BackupPaymentRecord {
  id: string;
  saleId: string;
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER';
  amountPoisha: number;
  reference: string | null;
  receivedAt: string;
}

export interface BackupSaleReturnRecord {
  id: string;
  saleId: string;
  returnNumber: string;
  refundMethod: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER' | 'CREDIT_ADJUSTMENT';
  subtotalPoisha: number;
  discountAdjustmentPoisha: number;
  refundTotalPoisha: number;
  cashRefundPoisha: number;
  creditAdjustedPoisha: number;
  reason: string | null;
  idempotencyKey: string | null;
  actorUserId: string | null;
  returnedAt: string;
}

export interface BackupSaleReturnItemRecord {
  id: string;
  saleReturnId: string;
  saleItemId: string;
  productId: string;
  qtyDisplay: string;
  qtyBase: string;
  unitSellingPricePoisha: number;
  lineRefundPoisha: number;
  restoredCogsPoisha: number;
}

export interface BackupPurchaseRecord {
  id: string;
  purchaseNumber: string;
  supplierId: string | null;
  supplierNameSnapshot: string | null;
  status: 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED';
  subtotalPoisha: number;
  discountPoisha: number;
  totalPoisha: number;
  paidPoisha: number;
  settledDuePoisha: number;
  duePoisha: number;
  paymentMethod: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER' | null;
  paymentReference: string | null;
  returnedTotalPoisha: number;
  cashRefundedPoisha: number;
  note: string | null;
  idempotencyKey: string | null;
  actorUserId: string | null;
  purchasedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupPurchaseItemRecord {
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
  createdAt: string;
}

export interface BackupPurchaseReturnRecord {
  id: string;
  purchaseId: string;
  returnNumber: string;
  refundMethod: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER' | 'PAYABLE_ADJUSTMENT';
  subtotalPoisha: number;
  discountAdjustmentPoisha: number;
  refundTotalPoisha: number;
  cashRefundPoisha: number;
  payableAdjustedPoisha: number;
  reason: string | null;
  idempotencyKey: string | null;
  actorUserId: string | null;
  returnedAt: string;
}

export interface BackupPurchaseReturnItemRecord {
  id: string;
  purchaseReturnId: string;
  purchaseItemId: string;
  productId: string;
  qtyDisplay: string;
  qtyBase: string;
  unitCostPoisha: number;
  lineRefundPoisha: number;
  reversedCostPoisha: number;
}

export interface BackupCustomerPaymentRecord {
  id: string;
  customerId: string;
  saleId: string | null;
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER';
  amountPoisha: number;
  reference: string | null;
  note: string | null;
  idempotencyKey: string | null;
  actorUserId: string | null;
  paidAt: string;
  createdAt: string;
}

export interface BackupSupplierPaymentRecord {
  id: string;
  supplierId: string;
  purchaseId: string | null;
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER';
  amountPoisha: number;
  reference: string | null;
  note: string | null;
  idempotencyKey: string | null;
  actorUserId: string | null;
  paidAt: string;
  createdAt: string;
}

export interface BackupExpenseCategoryRecord {
  id: string;
  nameBn: string;
  nameEn: string | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupExpenseRecord {
  id: string;
  categoryId: string;
  categoryNameSnapshot: string;
  amountPoisha: number;
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER';
  reference: string | null;
  note: string | null;
  incurredAt: string;
  idempotencyKey: string | null;
  actorUserId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupExpenseAuditLogRecord {
  id: string;
  expenseId: string;
  action: 'CREATED' | 'UPDATED';
  editedById: string | null;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown>;
  reason: string | null;
  occurredAt: string;
}

export interface BackupCashbookSessionRecord {
  id: string;
  businessDate: string;
  status: 'OPEN' | 'CLOSED';
  openingCashPoisha: number;
  expectedClosingCashPoisha: number;
  actualClosingCashPoisha: number | null;
  variancePoisha: number | null;
  note: string | null;
  openedByUserId: string | null;
  closedByUserId: string | null;
  openedAt: string;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupCashbookEntryRecord {
  id: string;
  sessionId: string | null;
  direction: 'IN' | 'OUT';
  entryType:
    | 'SALE_IN'
    | 'DUE_COLLECTION_IN'
    | 'PURCHASE_REFUND_IN'
    | 'OWNER_CASH_IN'
    | 'EXPENSE_ADJUST_IN'
    | 'SALE_REFUND_OUT'
    | 'SALE_CANCEL_OUT'
    | 'PURCHASE_OUT'
    | 'SUPPLIER_PAYMENT_OUT'
    | 'EXPENSE_OUT'
    | 'EXPENSE_ADJUST_OUT'
    | 'OWNER_DRAWING_OUT';
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER';
  amountPoisha: number;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  note: string | null;
  idempotencyKey: string | null;
  actorUserId: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface ShopBackupData {
  shop: BackupShopSnapshot;
  categories: BackupCategoryRecord[];
  units: BackupUnitRecord[];
  products: BackupProductRecord[];
  productUnits: BackupProductUnitRecord[];
  inventoryBalances: BackupInventoryBalanceRecord[];
  stockMovements: BackupStockMovementRecord[];
  stockAdjustments: BackupStockAdjustmentRecord[];
  customers: BackupCustomerRecord[];
  suppliers: BackupSupplierRecord[];
  sales: BackupSaleRecord[];
  saleItems: BackupSaleItemRecord[];
  payments: BackupPaymentRecord[];
  saleReturns: BackupSaleReturnRecord[];
  saleReturnItems: BackupSaleReturnItemRecord[];
  purchases: BackupPurchaseRecord[];
  purchaseItems: BackupPurchaseItemRecord[];
  purchaseReturns: BackupPurchaseReturnRecord[];
  purchaseReturnItems: BackupPurchaseReturnItemRecord[];
  customerPayments: BackupCustomerPaymentRecord[];
  supplierPayments: BackupSupplierPaymentRecord[];
  expenseCategories: BackupExpenseCategoryRecord[];
  expenses: BackupExpenseRecord[];
  expenseAuditLogs: BackupExpenseAuditLogRecord[];
  cashbookSessions: BackupCashbookSessionRecord[];
  cashbookEntries: BackupCashbookEntryRecord[];
}

export interface ShopBackupDocument {
  schemaVersion: 1;
  exportedAt: string;
  sourceShopId: string;
  checksumSha256: string;
  data: ShopBackupData;
}

export interface BackupRestoreCounts {
  categories: number;
  units: number;
  products: number;
  customers: number;
  suppliers: number;
  sales: number;
  purchases: number;
  expenses: number;
  cashbookSessions: number;
  cashbookEntries: number;
}

export interface BackupRestoreResponse {
  restoredAt: string;
  targetShopId: string;
  sourceShopId: string;
  counts: BackupRestoreCounts;
}
