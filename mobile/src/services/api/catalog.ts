import type {
  CategoryDto,
  InventoryValuationSummaryDto,
  ProductDto,
  StockAdjustmentDto,
  StockAdjustmentType,
  StockMovementDto,
  StockMovementType,
  UnitDto,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import {
  unwrapApiDelete,
  unwrapApiGet,
  unwrapApiPatch,
  unwrapApiPost,
  unwrapApiPut,
} from './client';

export interface ProductUnitInputPayload {
  unitId: string;
  conversionFactorToBase: string;
  sellingPricePoisha?: number | null;
}

export interface CreateProductPayload {
  nameBn: string;
  nameEn?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
  defaultSupplierName?: string | null;
  baseUnitId: string;
  defaultSaleUnitId?: string;
  defaultPurchaseUnitId?: string;
  baseSellingPricePoisha: number;
  lastPurchasePricePoisha?: number;
  lowStockThresholdBase?: string;
  units?: ProductUnitInputPayload[];
  openingStock?: {
    qtyDisplay: string;
    unitId: string;
    unitCostPoisha?: number;
    totalCostPoisha?: number;
    reason?: string | null;
  };
}

export interface UpdateProductPayload {
  nameBn?: string;
  nameEn?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
  defaultSupplierName?: string | null;
  baseUnitId?: string;
  defaultSaleUnitId?: string;
  defaultPurchaseUnitId?: string;
  baseSellingPricePoisha?: number;
  lastPurchasePricePoisha?: number;
  lowStockThresholdBase?: string;
  isActive?: boolean;
  expectedVersion?: number;
}

export interface CreateStockAdjustmentPayload {
  productId: string;
  adjustmentType: StockAdjustmentType;
  unitId: string;
  qtyDisplay?: string;
  direction?: 'INCREASE' | 'DECREASE';
  countedQtyDisplay?: string;
  reason?: string | null;
}

export const catalogApi = {
  listCategories(includeInactive = false): Promise<{ categories: CategoryDto[] }> {
    return unwrapApiGet('/categories', includeInactive ? { includeInactive: 'true' } : undefined);
  },

  createCategory(body: {
    nameBn: string;
    nameEn?: string | null;
    sortOrder?: number;
  }): Promise<{ category: CategoryDto }> {
    return unwrapApiPost('/categories', body);
  },

  updateCategory(
    id: string,
    body: { nameBn?: string; nameEn?: string | null; sortOrder?: number; isActive?: boolean },
  ): Promise<{ category: CategoryDto }> {
    return unwrapApiPatch(`/categories/${id}`, body);
  },

  archiveCategory(id: string): Promise<{ archived: true; id: string }> {
    return unwrapApiDelete(`/categories/${id}`);
  },

  listUnits(): Promise<{ units: UnitDto[] }> {
    return unwrapApiGet('/units');
  },

  createUnit(body: {
    code: string;
    nameBn: string;
    nameEn: string;
    isFractional?: boolean;
  }): Promise<{ unit: UnitDto }> {
    return unwrapApiPost('/units', body);
  },

  listProducts(params?: {
    q?: string;
    categoryId?: string;
    lowStockOnly?: boolean;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ products: ProductDto[] }> {
    const query: Record<string, string | number> = {};
    if (params?.q && params.q.trim().length > 0) query.q = params.q.trim();
    if (params?.categoryId) query.categoryId = params.categoryId;
    if (params?.lowStockOnly) query.lowStockOnly = 'true';
    if (params?.includeInactive) query.includeInactive = 'true';
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/products', query);
  },

  getProduct(id: string): Promise<{ product: ProductDto }> {
    return unwrapApiGet(`/products/${id}`);
  },

  createProduct(body: CreateProductPayload): Promise<{ product: ProductDto }> {
    return unwrapApiPost('/products', body);
  },

  updateProduct(id: string, body: UpdateProductPayload): Promise<{ product: ProductDto }> {
    return unwrapApiPatch(`/products/${id}`, body);
  },

  replaceProductUnits(
    id: string,
    units: ProductUnitInputPayload[],
  ): Promise<{ product: ProductDto }> {
    return unwrapApiPut(`/products/${id}/units`, { units });
  },

  archiveProduct(id: string): Promise<{ archived: true; id: string }> {
    return unwrapApiDelete(`/products/${id}`);
  },

  getLowStockAlerts(): Promise<{ products: ProductDto[] }> {
    return unwrapApiGet('/inventory/alerts');
  },

  listMovements(params?: {
    productId?: string;
    type?: StockMovementType;
    page?: number;
    limit?: number;
  }): Promise<{ movements: StockMovementDto[] }> {
    const query: Record<string, string | number> = {};
    if (params?.productId) query.productId = params.productId;
    if (params?.type) query.type = params.type;
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/inventory/movements', query);
  },

  listAdjustments(params?: {
    productId?: string;
    adjustmentType?: StockAdjustmentType;
    page?: number;
    limit?: number;
  }): Promise<{ adjustments: StockAdjustmentDto[] }> {
    const query: Record<string, string | number> = {};
    if (params?.productId) query.productId = params.productId;
    if (params?.adjustmentType) query.adjustmentType = params.adjustmentType;
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/inventory/adjustments', query);
  },

  getValuation(): Promise<{ valuation: InventoryValuationSummaryDto }> {
    return unwrapApiGet('/inventory/valuation');
  },

  createAdjustment(
    body: CreateStockAdjustmentPayload,
  ): Promise<{ adjustment: StockAdjustmentDto; product: ProductDto; idempotencyReplayed: boolean }> {
    const idempotencyKey = Crypto.randomUUID();
    return unwrapApiPost('/inventory/adjustments', body, {
      'X-Idempotency-Key': idempotencyKey,
    });
  },
};
