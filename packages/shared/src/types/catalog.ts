export const StockMovementTypes = {
  OPENING_STOCK: 'OPENING_STOCK',
  PURCHASE_IN: 'PURCHASE_IN',
  SALE_OUT: 'SALE_OUT',
  RETURN_IN: 'RETURN_IN',
  PURCHASE_RETURN_OUT: 'PURCHASE_RETURN_OUT',
  COUNT_ADJUST: 'COUNT_ADJUST',
  WASTAGE_OUT: 'WASTAGE_OUT',
  DAMAGE_OUT: 'DAMAGE_OUT',
  EXPIRED_OUT: 'EXPIRED_OUT',
} as const;

export type StockMovementType = (typeof StockMovementTypes)[keyof typeof StockMovementTypes];

export const StockAdjustmentTypes = {
  COUNT_ADJUST: 'COUNT_ADJUST',
  WASTAGE: 'WASTAGE',
  DAMAGE: 'DAMAGE',
  EXPIRED: 'EXPIRED',
} as const;

export type StockAdjustmentType =
  (typeof StockAdjustmentTypes)[keyof typeof StockAdjustmentTypes];

export interface UnitDto {
  id: string;
  shopId: string;
  code: string;
  nameBn: string;
  nameEn: string;
  isFractional: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDto {
  id: string;
  shopId: string;
  nameBn: string;
  nameEn: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductUnitDto {
  id: string;
  productId: string;
  unitId: string;
  unitCode: string;
  unitNameBn: string;
  unitNameEn: string;
  isFractional: boolean;
  conversionFactorToBase: string;
  sellingPricePoisha: number | null;
  isBaseUnit: boolean;
  isDefaultSaleUnit: boolean;
  isDefaultPurchaseUnit: boolean;
}

export interface InventoryBalanceDto {
  productId: string;
  qtyBase: string;
  /**
   * Hidden (`null`) for EMPLOYEE accounts to protect wholesale cost margins.
   */
  avgCostPerBaseBdt: string | null;
  /**
   * Hidden (`null`) for EMPLOYEE accounts.
   */
  valuationPoisha: number | null;
  version: number;
  updatedAt: string;
}

export interface ProductDto {
  id: string;
  shopId: string;
  categoryId: string | null;
  categoryNameBn: string | null;
  categoryNameEn: string | null;
  nameBn: string;
  nameEn: string | null;
  barcode: string | null;
  imageUrl: string | null;
  defaultSupplierName: string | null;
  baseUnitId: string;
  baseUnitCode: string;
  baseUnitNameBn: string;
  baseUnitNameEn: string;
  defaultSaleUnitId: string;
  defaultPurchaseUnitId: string;
  baseSellingPricePoisha: number;
  /**
   * Hidden (`null`) for EMPLOYEE accounts.
   */
  lastPurchasePricePoisha: number | null;
  lowStockThresholdBase: string;
  isLowStock: boolean;
  isActive: boolean;
  version: number;
  units: ProductUnitDto[];
  inventory: InventoryBalanceDto;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementDto {
  id: string;
  shopId: string;
  productId: string;
  productNameBn: string;
  productNameEn: string | null;
  baseUnitNameBn: string;
  baseUnitNameEn: string;
  movementType: StockMovementType;
  deltaQtyBase: string;
  balanceAfterBase: string;
  unitCostBdt: string | null;
  valuePoisha: number | null;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface StockAdjustmentDto {
  id: string;
  shopId: string;
  productId: string;
  productNameBn: string;
  productNameEn: string | null;
  adjustmentType: StockAdjustmentType;
  qtyBase: string;
  deltaQtyBase: string;
  unitCostBdt: string | null;
  lossPoisha: number | null;
  reason: string | null;
  actorUserId: string | null;
  actorName: string | null;
  adjustedAt: string;
}

export interface InventoryValuationItemDto {
  productId: string;
  nameBn: string;
  nameEn: string | null;
  baseUnitNameBn: string;
  baseUnitNameEn: string;
  qtyBase: string;
  avgCostPerBaseBdt: string;
  valuationPoisha: number;
  lowStockThresholdBase: string;
  isLowStock: boolean;
}

export interface InventoryValuationSummaryDto {
  totalValuationPoisha: number;
  totalActiveProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  items: InventoryValuationItemDto[];
}
