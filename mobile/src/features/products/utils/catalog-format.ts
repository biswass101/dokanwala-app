import {
  calculateLineTotalPoisha,
  compareQuantities,
  convertFromBaseQuantity,
  formatQuantityDisplay,
  toBanglaDigits,
  type DigitStyle,
  type LanguageCode,
  type ProductDto,
  type ProductUnitDto,
  type StockAdjustmentType,
  type StockMovementType,
  type UnitDto,
} from '@dokanwala/shared';
import type { TFunction } from 'i18next';
import type { BadgeTone } from '@/components/ui/Badge';

export function getLocalizedProductName(
  item: { nameBn: string; nameEn?: string | null },
  language: LanguageCode,
): string {
  if (language === 'en' && item.nameEn && item.nameEn.trim().length > 0) {
    return item.nameEn;
  }
  return item.nameBn;
}

export function getLocalizedUnitName(
  unit: { unitNameBn?: string; unitNameEn?: string; nameBn?: string; nameEn?: string },
  language: LanguageCode,
): string {
  const bn = unit.nameBn ?? unit.unitNameBn ?? '';
  const en = unit.nameEn ?? unit.unitNameEn ?? '';
  if (language === 'en' && en.trim().length > 0) {
    return en;
  }
  return bn || en;
}

export function getLocalizedCategoryName(
  item: { categoryNameBn: string | null; categoryNameEn: string | null } | { nameBn: string; nameEn: string | null },
  language: LanguageCode,
): string | null {
  if ('categoryNameBn' in item) {
    if (language === 'en' && item.categoryNameEn && item.categoryNameEn.trim().length > 0) {
      return item.categoryNameEn;
    }
    return item.categoryNameBn;
  }
  if (language === 'en' && item.nameEn && item.nameEn.trim().length > 0) {
    return item.nameEn;
  }
  return item.nameBn;
}

export function formatQuantityWithDigits(qty: string | number, digitStyle: DigitStyle): string {
  const clean = formatQuantityDisplay(qty, 3);
  return digitStyle === 'bn' ? toBanglaDigits(clean) : clean;
}

/**
 * Formats stock quantity in base unit + secondary configured unit when meaningful
 * (e.g. `২০০ টি (১০ বিড়া)` for Pan or `১২.৫ কেজি`).
 */
export function formatProductStockDisplay(
  product: ProductDto,
  language: LanguageCode,
  digitStyle: DigitStyle,
): string {
  const baseQtyFormatted = formatQuantityWithDigits(product.inventory.qtyBase, digitStyle);
  const baseUnitLabel = getLocalizedUnitName(
    { nameBn: product.baseUnitNameBn, nameEn: product.baseUnitNameEn },
    language,
  );
  const basePart = `${baseQtyFormatted} ${baseUnitLabel}`;

  // Pick a meaningful non-base unit (default sale unit if different from base, or highest factor > 1)
  const secondaryUnit =
    product.units.find((u) => !u.isBaseUnit && u.unitId === product.defaultSaleUnitId) ??
    product.units.find((u) => !u.isBaseUnit && compareQuantities(u.conversionFactorToBase, '1') > 0);

  if (!secondaryUnit) {
    return basePart;
  }

  try {
    if (compareQuantities(product.inventory.qtyBase, '0') <= 0) {
      return basePart;
    }
    const converted = convertFromBaseQuantity(
      product.inventory.qtyBase,
      secondaryUnit.conversionFactorToBase,
    );
    const convertedFormatted = formatQuantityWithDigits(converted, digitStyle);
    const secondaryLabel = getLocalizedUnitName(secondaryUnit, language);
    return `${basePart} (${convertedFormatted} ${secondaryLabel})`;
  } catch {
    return basePart;
  }
}

export function getEffectiveUnitSellingPricePoisha(
  product: ProductDto,
  unitRule: ProductUnitDto,
): number {
  if (unitRule.sellingPricePoisha !== null && unitRule.sellingPricePoisha !== undefined) {
    return unitRule.sellingPricePoisha;
  }
  return calculateLineTotalPoisha(unitRule.conversionFactorToBase, product.baseSellingPricePoisha);
}

export function findPreferredDisplayUnit(product: ProductDto): ProductUnitDto | undefined {
  return (
    product.units.find((u) => u.unitId === product.defaultSaleUnitId) ??
    product.units.find((u) => u.isBaseUnit) ??
    product.units[0]
  );
}

export function getMovementTypeBadge(
  movementType: StockMovementType,
  t: TFunction,
): { label: string; tone: BadgeTone } {
  const key = `inventory.movementTypes.${movementType}`;
  const label = t(key);
  switch (movementType) {
    case 'OPENING_STOCK':
    case 'PURCHASE_IN':
    case 'RETURN_IN':
      return { label, tone: 'success' };
    case 'WASTAGE_OUT':
    case 'DAMAGE_OUT':
    case 'EXPIRED_OUT':
      return { label, tone: 'danger' };
    case 'COUNT_ADJUST':
      return { label, tone: 'warning' };
    case 'SALE_OUT':
    case 'PURCHASE_RETURN_OUT':
    default:
      return { label, tone: 'primary' };
  }
}

export function getAdjustmentTypeLabel(type: StockAdjustmentType, t: TFunction): string {
  return t(`inventory.adjustmentTypes.${type}`);
}

export function getUnitLabelById(
  units: readonly UnitDto[],
  unitId: string,
  language: LanguageCode,
): string {
  const found = units.find((u) => u.id === unitId);
  return found ? getLocalizedUnitName(found, language) : '';
}
