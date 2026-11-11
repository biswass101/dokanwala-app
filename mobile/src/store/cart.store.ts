import {
  addPoisha,
  addQuantities,
  bdtToPoisha,
  calculateDiscountPoisha,
  calculateLineTotalPoisha,
  compareQuantities,
  convertToBaseQuantity,
  formatQuantityDisplay,
  toBanglaDigits,
  type CustomerDto,
  type DigitStyle,
  type DiscountType,
  type ProductDto,
  type ProductUnitDto,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import {
  findPreferredDisplayUnit,
  getEffectiveUnitSellingPricePoisha,
} from '@/features/products/utils/catalog-format';

export interface CartLine {
  lineKey: string;
  productId: string;
  unitId: string;
  product: ProductDto;
  qtyRaw: string;
  qtyAscii: string;
}

export interface CartTotalsSummary {
  subtotalPoisha: number;
  discountPoisha: number;
  totalPoisha: number;
  requestedBaseByProduct: Record<string, string>;
  hasValidQuantities: boolean;
  hasDiscountError: boolean;
}

function buildLineKey(productId: string, unitId: string): string {
  return `${productId}::${unitId}`;
}

function formatQtyForInput(asciiQty: string, digitStyle: DigitStyle): string {
  const clean = formatQuantityDisplay(asciiQty, 3);
  return digitStyle === 'bn' ? toBanglaDigits(clean) : clean;
}

export function getCartLineUnitRule(line: CartLine): ProductUnitDto | undefined {
  return (
    line.product.units.find((u) => u.unitId === line.unitId) ??
    line.product.units.find((u) => u.isBaseUnit) ??
    line.product.units[0]
  );
}

export function getCartLineUnitPricePoisha(line: CartLine): number {
  const rule = getCartLineUnitRule(line);
  if (!rule) return line.product.baseSellingPricePoisha;
  return getEffectiveUnitSellingPricePoisha(line.product, rule);
}

export function getCartLineSubtotalPoisha(line: CartLine): number {
  if (!line.qtyAscii.trim()) return 0;
  try {
    const unitPrice = getCartLineUnitPricePoisha(line);
    return calculateLineTotalPoisha(line.qtyAscii, unitPrice);
  } catch {
    return 0;
  }
}

export function getCartLineBaseQty(line: CartLine): string {
  if (!line.qtyAscii.trim()) return '0.0000';
  const rule = getCartLineUnitRule(line);
  if (!rule) return '0.0000';
  try {
    return convertToBaseQuantity(line.qtyAscii, rule.conversionFactorToBase);
  } catch {
    return '0.0000';
  }
}

export function computeCartSummary(
  items: readonly CartLine[],
  discountType: DiscountType,
  discountAscii: string,
): CartTotalsSummary {
  let subtotalPoisha = 0;
  const requestedBaseByProduct: Record<string, string> = {};
  let hasValidQuantities = items.length > 0;

  for (const line of items) {
    let validQty = false;
    try {
      if (line.qtyAscii.trim().length > 0 && compareQuantities(line.qtyAscii, '0') > 0) {
        validQty = true;
      }
    } catch {
      validQty = false;
    }

    if (!validQty) {
      hasValidQuantities = false;
      continue;
    }

    const lineSub = getCartLineSubtotalPoisha(line);
    subtotalPoisha = addPoisha(subtotalPoisha, lineSub);

    const lineBase = getCartLineBaseQty(line);
    const prevBase = requestedBaseByProduct[line.productId];
    requestedBaseByProduct[line.productId] = prevBase
      ? addQuantities(prevBase, lineBase)
      : lineBase;
  }

  let discountPoisha = 0;
  let hasDiscountError = false;
  const cleanDisc = discountAscii.trim();
  if (cleanDisc.length > 0) {
    try {
      if (discountType === 'FIXED_POISHA') {
        const poishaVal = bdtToPoisha(cleanDisc);
        discountPoisha = calculateDiscountPoisha(subtotalPoisha, 'FIXED_POISHA', poishaVal);
      } else {
        discountPoisha = calculateDiscountPoisha(subtotalPoisha, 'PERCENT', cleanDisc);
      }
      if (discountPoisha > subtotalPoisha) {
        hasDiscountError = true;
      }
    } catch {
      hasDiscountError = true;
    }
  }

  const totalPoisha = Math.max(0, subtotalPoisha - discountPoisha);

  return {
    subtotalPoisha,
    discountPoisha,
    totalPoisha,
    requestedBaseByProduct,
    hasValidQuantities,
    hasDiscountError,
  };
}

interface CartState {
  items: CartLine[];
  discountType: DiscountType;
  discountRaw: string;
  discountAscii: string;
  selectedCustomer: CustomerDto | null;
  note: string;
  checkoutIdempotencyKey: string | null;

  addProduct: (product: ProductDto, digitStyle?: DigitStyle, explicitUnitId?: string) => void;
  setLineQty: (lineKey: string, qtyAscii: string, qtyRaw: string) => void;
  stepLineQty: (lineKey: string, delta: number, digitStyle?: DigitStyle) => void;
  changeLineUnit: (lineKey: string, newUnitId: string, digitStyle?: DigitStyle) => void;
  syncProducts: (latestProducts: readonly ProductDto[]) => void;
  removeLine: (lineKey: string) => void;
  setDiscountType: (type: DiscountType) => void;
  setDiscountInput: (discountAscii: string, discountRaw: string) => void;
  setSelectedCustomer: (customer: CustomerDto | null) => void;
  setNote: (note: string) => void;
  ensureCheckoutIdempotencyKey: () => string;
  rotateCheckoutIdempotencyKey: () => string;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discountType: 'FIXED_POISHA',
  discountRaw: '',
  discountAscii: '',
  selectedCustomer: null,
  note: '',
  checkoutIdempotencyKey: null,

  addProduct: (product, digitStyle = 'bn', explicitUnitId) => {
    const preferredRule = explicitUnitId
      ? product.units.find((u) => u.unitId === explicitUnitId)
      : findPreferredDisplayUnit(product);
    const targetUnitId = preferredRule?.unitId ?? product.baseUnitId;
    const targetKey = buildLineKey(product.id, targetUnitId);

    set((state) => {
      const existing = state.items.find((it) => it.lineKey === targetKey);
      if (existing) {
        const nextAscii = formatQuantityDisplay(addQuantities(existing.qtyAscii || '0', '1'), 3);
        const nextRaw = formatQtyForInput(nextAscii, digitStyle);
        return {
          items: state.items.map((it) =>
            it.lineKey === targetKey
              ? { ...it, product, qtyAscii: nextAscii, qtyRaw: nextRaw }
              : it,
          ),
          checkoutIdempotencyKey: null,
        };
      }

      const initialAscii = '1';
      return {
        items: [
          ...state.items,
          {
            lineKey: targetKey,
            productId: product.id,
            unitId: targetUnitId,
            product,
            qtyAscii: initialAscii,
            qtyRaw: formatQtyForInput(initialAscii, digitStyle),
          },
        ],
        checkoutIdempotencyKey: null,
      };
    });
  },

  setLineQty: (lineKey, qtyAscii, qtyRaw) => {
    set((state) => ({
      items: state.items.map((it) => (it.lineKey === lineKey ? { ...it, qtyAscii, qtyRaw } : it)),
      checkoutIdempotencyKey: null,
    }));
  },

  stepLineQty: (lineKey, delta, digitStyle = 'bn') => {
    set((state) => {
      const target = state.items.find((it) => it.lineKey === lineKey);
      if (!target) return state;

      let currentVal = '0';
      try {
        if (target.qtyAscii.trim()) {
          currentVal = target.qtyAscii;
        }
      } catch {
        currentVal = '0';
      }

      const nextDec =
        delta >= 0
          ? addQuantities(currentVal, String(delta))
          : (() => {
              const targetDelta = String(Math.abs(delta));
              return compareQuantities(currentVal, targetDelta) > 0
                ? addQuantities(currentVal, String(delta))
                : '0';
            })();

      if (compareQuantities(nextDec, '0') <= 0) {
        return {
          items: state.items.filter((it) => it.lineKey !== lineKey),
          checkoutIdempotencyKey: null,
        };
      }

      const cleanAscii = formatQuantityDisplay(nextDec, 3);
      return {
        items: state.items.map((it) =>
          it.lineKey === lineKey
            ? {
                ...it,
                qtyAscii: cleanAscii,
                qtyRaw: formatQtyForInput(cleanAscii, digitStyle),
              }
            : it,
        ),
        checkoutIdempotencyKey: null,
      };
    });
  },

  changeLineUnit: (lineKey, newUnitId, digitStyle = 'bn') => {
    set((state) => {
      const current = state.items.find((it) => it.lineKey === lineKey);
      if (!current || current.unitId === newUnitId) {
        return state;
      }

      const targetKey = buildLineKey(current.productId, newUnitId);
      const conflictLine = state.items.find((it) => it.lineKey === targetKey);
      if (conflictLine) {
        const mergedAscii = formatQuantityDisplay(
          addQuantities(conflictLine.qtyAscii || '0', current.qtyAscii || '0'),
          3,
        );
        return {
          items: state.items
            .filter((it) => it.lineKey !== lineKey)
            .map((it) =>
              it.lineKey === targetKey
                ? {
                    ...it,
                    qtyAscii: mergedAscii,
                    qtyRaw: formatQtyForInput(mergedAscii, digitStyle),
                  }
                : it,
            ),
          checkoutIdempotencyKey: null,
        };
      }

      return {
        items: state.items.map((it) =>
          it.lineKey === lineKey ? { ...it, lineKey: targetKey, unitId: newUnitId } : it,
        ),
        checkoutIdempotencyKey: null,
      };
    });
  },

  syncProducts: (latestProducts) => {
    const productMap = new Map(latestProducts.map((p) => [p.id, p]));
    set((state) => {
      let changed = false;
      const nextItems = state.items.map((it) => {
        const fresh = productMap.get(it.productId);
        if (fresh && fresh !== it.product) {
          changed = true;
          return { ...it, product: fresh };
        }
        return it;
      });
      return changed ? { items: nextItems } : state;
    });
  },

  removeLine: (lineKey) => {
    set((state) => ({
      items: state.items.filter((it) => it.lineKey !== lineKey),
      checkoutIdempotencyKey: null,
    }));
  },

  setDiscountType: (discountType) => {
    set({
      discountType,
      discountRaw: '',
      discountAscii: '',
      checkoutIdempotencyKey: null,
    });
  },

  setDiscountInput: (discountAscii, discountRaw) => {
    set({
      discountAscii,
      discountRaw,
      checkoutIdempotencyKey: null,
    });
  },

  setSelectedCustomer: (selectedCustomer) => {
    set({
      selectedCustomer,
      checkoutIdempotencyKey: null,
    });
  },

  setNote: (note) => {
    set({
      note,
      checkoutIdempotencyKey: null,
    });
  },

  ensureCheckoutIdempotencyKey: () => {
    const current = get().checkoutIdempotencyKey;
    if (current) return current;
    const created = Crypto.randomUUID();
    set({ checkoutIdempotencyKey: created });
    return created;
  },

  rotateCheckoutIdempotencyKey: () => {
    const created = Crypto.randomUUID();
    set({ checkoutIdempotencyKey: created });
    return created;
  },

  clearCart: () => {
    set({
      items: [],
      discountType: 'FIXED_POISHA',
      discountRaw: '',
      discountAscii: '',
      selectedCustomer: null,
      note: '',
      checkoutIdempotencyKey: null,
    });
  },
}));
