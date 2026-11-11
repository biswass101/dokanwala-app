import {
  calculateInventoryValuationPoisha,
  compareQuantities,
  type ProductDto,
  type ProductUnitDto,
  type UserRole,
} from '@dokanwala/shared';
import type { Prisma } from '../../generated/prisma/client.js';

export const productInclude = {
  category: true,
  baseUnit: true,
  defaultSaleUnit: true,
  defaultPurchaseUnit: true,
  productUnits: {
    where: { isActive: true },
    include: { unit: true },
    orderBy: [{ conversionFactorToBase: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  inventoryBalance: true,
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

export function toProductDto(product: ProductWithRelations, role: UserRole): ProductDto {
  const isOwner = role === 'OWNER';
  const qtyBase = product.inventoryBalance ? product.inventoryBalance.qtyBase.toFixed(4) : '0.0000';
  const avgCostBdt = product.inventoryBalance
    ? product.inventoryBalance.avgCostPerBaseBdt.toFixed(6)
    : '0.000000';
  const thresholdBase = product.lowStockThresholdBase.toFixed(4);

  const units: ProductUnitDto[] = product.productUnits.map((pu) => ({
    id: pu.id,
    productId: pu.productId,
    unitId: pu.unitId,
    unitCode: pu.unit.code,
    unitNameBn: pu.unit.nameBn,
    unitNameEn: pu.unit.nameEn,
    isFractional: pu.unit.isFractional,
    conversionFactorToBase: pu.conversionFactorToBase.toFixed(4),
    sellingPricePoisha: pu.sellingPricePoisha,
    isBaseUnit: pu.unitId === product.baseUnitId,
    isDefaultSaleUnit: pu.unitId === product.defaultSaleUnitId,
    isDefaultPurchaseUnit: pu.unitId === product.defaultPurchaseUnitId,
  }));

  return {
    id: product.id,
    shopId: product.shopId,
    categoryId: product.categoryId,
    categoryNameBn: product.category?.nameBn ?? null,
    categoryNameEn: product.category?.nameEn ?? null,
    nameBn: product.nameBn,
    nameEn: product.nameEn,
    barcode: product.barcode,
    imageUrl: product.imageUrl,
    defaultSupplierName: product.defaultSupplierName,
    baseUnitId: product.baseUnitId,
    baseUnitCode: product.baseUnit.code,
    baseUnitNameBn: product.baseUnit.nameBn,
    baseUnitNameEn: product.baseUnit.nameEn,
    defaultSaleUnitId: product.defaultSaleUnitId,
    defaultPurchaseUnitId: product.defaultPurchaseUnitId,
    baseSellingPricePoisha: product.baseSellingPricePoisha,
    lastPurchasePricePoisha: isOwner ? product.lastPurchasePricePoisha : null,
    lowStockThresholdBase: thresholdBase,
    isLowStock: compareQuantities(qtyBase, thresholdBase) <= 0,
    isActive: product.isActive,
    version: product.version,
    units,
    inventory: {
      productId: product.id,
      qtyBase,
      avgCostPerBaseBdt: isOwner ? avgCostBdt : null,
      valuationPoisha: isOwner ? calculateInventoryValuationPoisha(qtyBase, avgCostBdt) : null,
      version: product.inventoryBalance?.version ?? 1,
      updatedAt: (product.inventoryBalance?.updatedAt ?? product.updatedAt).toISOString(),
    },
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
