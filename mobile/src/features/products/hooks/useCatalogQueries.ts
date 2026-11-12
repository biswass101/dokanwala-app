import type {
  CategoryDto,
  InventoryValuationSummaryDto,
  ProductDto,
  StockMovementDto,
  StockMovementType,
  UnitDto,
} from '@dokanwala/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadLocalCategories,
  loadLocalProductById,
  loadLocalProducts,
  loadLocalUnits,
  removeLocalProduct,
  replaceLocalProducts,
  saveLocalCategories,
  saveLocalUnits,
  upsertLocalProduct,
} from '@/database/repositories/catalog-local.repo';
import {
  archiveOfflineProductWithOutbox,
  createOfflineProductWithOutbox,
  createOfflineStockAdjustmentWithOutbox,
  updateOfflineProductWithOutbox,
} from '@/database/repositories/offline-writes.repo';
import {
  catalogApi,
  type CreateProductPayload,
  type CreateStockAdjustmentPayload,
  type ProductUnitInputPayload,
  type UpdateProductPayload,
} from '@/services/api/catalog';
import { ApiClientError } from '@/services/api/client';
import {
  executeOnlineOrOffline,
  getOfflineActorContext,
} from '@/services/sync/offline-mutation-helper';
import { useAuthStore } from '@/store/auth.store';

export const catalogKeys = {
  all: ['catalog'] as const,
  categories: (includeInactive: boolean) => ['catalog', 'categories', includeInactive] as const,
  units: () => ['catalog', 'units'] as const,
  products: (params: {
    q?: string;
    categoryId?: string;
    lowStockOnly?: boolean;
    includeInactive?: boolean;
  }) => ['catalog', 'products', params] as const,
  productDetail: (id: string) => ['catalog', 'product', id] as const,
  lowStockAlerts: () => ['inventory', 'alerts'] as const,
  movements: (params: { productId?: string; type?: StockMovementType }) =>
    ['inventory', 'movements', params] as const,
  valuation: () => ['inventory', 'valuation'] as const,
};

function isNetworkFailure(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === 'NETWORK_ERROR';
}

export function useCategoriesQuery(includeInactive = false) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');

  return useQuery<{ categories: CategoryDto[]; fromOfflineCache: boolean }>({
    queryKey: catalogKeys.categories(includeInactive),
    queryFn: async () => {
      try {
        const res = await catalogApi.listCategories(includeInactive);
        if (!includeInactive) {
          await saveLocalCategories(res.categories);
        }
        return { categories: res.categories, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalCategories(shopId, includeInactive);
          return { categories: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useUnitsQuery() {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');

  return useQuery<{ units: UnitDto[]; fromOfflineCache: boolean }>({
    queryKey: catalogKeys.units(),
    queryFn: async () => {
      try {
        const res = await catalogApi.listUnits();
        await saveLocalUnits(res.units);
        return { units: res.units, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalUnits(shopId);
          return { units: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useProductsQuery(params?: {
  q?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
}) {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  const normalizedParams = {
    ...(params?.q && params.q.trim().length > 0 ? { q: params.q.trim() } : {}),
    ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params?.lowStockOnly ? { lowStockOnly: true } : {}),
    ...(params?.includeInactive ? { includeInactive: true } : {}),
  };

  const isUnfiltered =
    !normalizedParams.q &&
    !normalizedParams.categoryId &&
    !normalizedParams.lowStockOnly &&
    !normalizedParams.includeInactive;

  return useQuery<{ products: ProductDto[]; fromOfflineCache: boolean }>({
    queryKey: catalogKeys.products(normalizedParams),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await catalogApi.listProducts({
          ...normalizedParams,
          limit: 200,
        });
        if (isUnfiltered) {
          await replaceLocalProducts(res.products);
        }
        return { products: res.products, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalProducts(shopId, normalizedParams);
          return { products: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useProductDetailQuery(productId: string | undefined) {
  return useQuery<{ product: ProductDto; fromOfflineCache: boolean }>({
    queryKey: catalogKeys.productDetail(productId ?? ''),
    queryFn: async () => {
      if (!productId) {
        throw new Error('Product ID missing');
      }
      try {
        const res = await catalogApi.getProduct(productId);
        await upsertLocalProduct(res.product);
        return { product: res.product, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err)) {
          const cached = await loadLocalProductById(productId);
          if (cached) {
            return { product: cached, fromOfflineCache: true };
          }
        }
        throw err;
      }
    },
    enabled: Boolean(productId),
  });
}

export function useLowStockAlertsQuery() {
  const shopId = useAuthStore((s) => s.shop?.id ?? '');
  return useQuery<{ products: ProductDto[]; fromOfflineCache: boolean }>({
    queryKey: catalogKeys.lowStockAlerts(),
    queryFn: async () => {
      try {
        const res = await catalogApi.getLowStockAlerts();
        return { products: res.products, fromOfflineCache: false };
      } catch (err) {
        if (isNetworkFailure(err) && shopId) {
          const cached = await loadLocalProducts(shopId, { lowStockOnly: true });
          return { products: cached, fromOfflineCache: true };
        }
        throw err;
      }
    },
    enabled: Boolean(shopId),
  });
}

export function useMovementsQuery(params?: { productId?: string; type?: StockMovementType }) {
  const normalized = {
    ...(params?.productId ? { productId: params.productId } : {}),
    ...(params?.type ? { type: params.type } : {}),
  };
  return useQuery<{ movements: StockMovementDto[] }>({
    queryKey: catalogKeys.movements(normalized),
    queryFn: () => catalogApi.listMovements({ ...normalized, limit: 100 }),
  });
}

export function useValuationQuery(enabled: boolean) {
  return useQuery<{ valuation: InventoryValuationSummaryDto }>({
    queryKey: catalogKeys.valuation(),
    queryFn: () => catalogApi.getValuation(),
    enabled,
  });
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProductPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => catalogApi.createProduct(payload),
        offlineFn: async () => ({
          product: await createOfflineProductWithOutbox(getOfflineActorContext(), payload),
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalProduct(res.product);
      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useUpdateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: UpdateProductPayload;
      units?: ProductUnitInputPayload[];
    }) =>
      executeOnlineOrOffline({
        onlineFn: async () => {
          const updated = await catalogApi.updateProduct(input.id, input.patch);
          if (input.units) {
            return catalogApi.replaceProductUnits(input.id, input.units);
          }
          return updated;
        },
        offlineFn: async () => ({
          product: await updateOfflineProductWithOutbox(
            getOfflineActorContext(),
            input.id,
            input.patch,
            input.units,
          ),
        }),
      }),
    onSuccess: async (res) => {
      await upsertLocalProduct(res.product);
      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useArchiveProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      executeOnlineOrOffline({
        onlineFn: () => catalogApi.archiveProduct(id),
        offlineFn: async () => {
          await archiveOfflineProductWithOutbox(getOfflineActorContext(), id);
          return { archived: true as const, id };
        },
      }),
    onSuccess: async (res) => {
      await removeLocalProduct(res.id);
      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useCreateAdjustmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateStockAdjustmentPayload) =>
      executeOnlineOrOffline({
        onlineFn: () => catalogApi.createAdjustment(payload),
        offlineFn: async () => {
          const ctx = getOfflineActorContext();
          const product = await createOfflineStockAdjustmentWithOutbox(ctx, payload);
          const now = new Date().toISOString();
          return {
            adjustment: {
              id: product.id,
              shopId: ctx.shopId,
              productId: product.id,
              productNameBn: product.nameBn,
              productNameEn: product.nameEn,
              adjustmentType: payload.adjustmentType,
              qtyBase: payload.qtyDisplay ?? payload.countedQtyDisplay ?? '0.0000',
              deltaQtyBase: '0.0000',
              unitCostBdt: product.inventory.avgCostPerBaseBdt,
              lossPoisha: null,
              reason: payload.reason ?? null,
              actorUserId: ctx.userId,
              actorName: ctx.userName,
              adjustedAt: now,
            },
            product,
            idempotencyReplayed: false,
          };
        },
      }),
    onSuccess: async (res) => {
      await upsertLocalProduct(res.product);
      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { nameBn: string; nameEn?: string | null; sortOrder?: number }) =>
      catalogApi.createCategory(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}

export function useArchiveCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => catalogApi.archiveCategory(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}

export function useCreateUnitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      code: string;
      nameBn: string;
      nameEn: string;
      isFractional?: boolean;
    }) => catalogApi.createUnit(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}
