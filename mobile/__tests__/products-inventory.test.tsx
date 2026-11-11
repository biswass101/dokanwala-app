import type {
  AuthUserDto,
  CategoryDto,
  ProductDto,
  ShopProfileDto,
  UnitDto,
} from '@dokanwala/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import ProductsScreen from '@/app/(tabs)/products';
import StockAdjustmentScreen from '@/app/inventory/adjust';
import ProductFormScreen from '@/app/products/form';
import {
  clearLocalCatalogData,
  loadLocalCategories,
  loadLocalProductById,
  loadLocalProducts,
  loadLocalUnits,
  replaceLocalProducts,
  saveLocalCategories,
  saveLocalUnits,
} from '@/database/repositories/catalog-local.repo';
import { resetLocalDatabaseInstanceForTests } from '@/database/sqlite';
import { openPlatformSqliteDatabase } from '@/database/sqlite-driver.web';
import { catalogApi } from '@/services/api/catalog';
import { ApiClientError } from '@/services/api/client';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

const SHOP_ID = '11111111-1111-4111-8111-111111111111';
const CAT_PAN_ID = '22222222-2222-4222-8222-222222222221';
const UNIT_PIECE_ID = '33333333-3333-4333-8333-333333333331';
const UNIT_BIRA_ID = '33333333-3333-4333-8333-333333333332';
const UNIT_GRAM_ID = '33333333-3333-4333-8333-333333333333';
const PROD_PAN_ID = '44444444-4444-4444-8444-444444444441';
const PROD_SUPARI_ID = '44444444-4444-4444-8444-444444444442';

const sampleOwner: AuthUserDto = {
  id: 'owner-1',
  shopId: SHOP_ID,
  name: 'রহিম মালিক',
  phone: '+8801711223344',
  role: 'OWNER',
  hasPin: true,
  preferredLanguage: 'bn',
  preferredDigitStyle: 'bn',
  isActive: true,
  createdAt: '2026-11-12T00:00:00.000Z',
};

const sampleEmployee: AuthUserDto = {
  ...sampleOwner,
  id: 'emp-1',
  name: 'করিম কর্মচারী',
  role: 'EMPLOYEE',
};

const sampleShop: ShopProfileDto = {
  id: SHOP_ID,
  nameBn: 'রহিম পান ও মুদি স্টোর',
  nameEn: 'Rahim Pan & Grocery Store',
  addressBn: 'চকবাজার, ঢাকা',
  addressEn: null,
  phone: '+8801711223344',
  logoUrl: null,
  currencyCode: 'BDT',
  timezone: 'Asia/Dhaka',
  defaultLanguage: 'bn',
  defaultDigitStyle: 'bn',
  receiptHeaderBn: null,
  receiptFooterBn: null,
  allowNegativeStock: false,
  employeeCanGiveCredit: true,
  employeeMaxDiscountPercent: 10,
  isActive: true,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleCategories: CategoryDto[] = [
  {
    id: CAT_PAN_ID,
    shopId: SHOP_ID,
    nameBn: 'পান ও সুপারি',
    nameEn: 'Pan & Supari',
    sortOrder: 10,
    isActive: true,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
];

const sampleUnits: UnitDto[] = [
  {
    id: UNIT_PIECE_ID,
    shopId: SHOP_ID,
    code: 'PIECE',
    nameBn: 'টি',
    nameEn: 'Piece',
    isFractional: false,
    isDefault: true,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
  {
    id: UNIT_BIRA_ID,
    shopId: SHOP_ID,
    code: 'BIRA',
    nameBn: 'বিড়া',
    nameEn: 'Bira',
    isFractional: false,
    isDefault: true,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
  {
    id: UNIT_GRAM_ID,
    shopId: SHOP_ID,
    code: 'GRAM',
    nameBn: 'গ্রাম',
    nameEn: 'Gram',
    isFractional: true,
    isDefault: true,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
];

const panProduct: ProductDto = {
  id: PROD_PAN_ID,
  shopId: SHOP_ID,
  categoryId: CAT_PAN_ID,
  categoryNameBn: 'পান ও সুপারি',
  categoryNameEn: 'Pan & Supari',
  nameBn: 'দেশি মিষ্টি পান',
  nameEn: 'Deshi Misti Pan',
  barcode: null,
  imageUrl: null,
  defaultSupplierName: 'করিম আড়ত',
  baseUnitId: UNIT_PIECE_ID,
  baseUnitCode: 'PIECE',
  baseUnitNameBn: 'টি',
  baseUnitNameEn: 'Piece',
  defaultSaleUnitId: UNIT_BIRA_ID,
  defaultPurchaseUnitId: UNIT_BIRA_ID,
  baseSellingPricePoisha: 150,
  lastPurchasePricePoisha: 2500,
  lowStockThresholdBase: '40.0000',
  isLowStock: false,
  isActive: true,
  version: 1,
  units: [
    {
      id: 'pu-1',
      productId: PROD_PAN_ID,
      unitId: UNIT_PIECE_ID,
      unitCode: 'PIECE',
      unitNameBn: 'টি',
      unitNameEn: 'Piece',
      isFractional: false,
      conversionFactorToBase: '1.0000',
      sellingPricePoisha: 150,
      isBaseUnit: true,
      isDefaultSaleUnit: false,
      isDefaultPurchaseUnit: false,
    },
    {
      id: 'pu-2',
      productId: PROD_PAN_ID,
      unitId: UNIT_BIRA_ID,
      unitCode: 'BIRA',
      unitNameBn: 'বিড়া',
      unitNameEn: 'Bira',
      isFractional: false,
      conversionFactorToBase: '20.0000',
      sellingPricePoisha: 2500,
      isBaseUnit: false,
      isDefaultSaleUnit: true,
      isDefaultPurchaseUnit: true,
    },
  ],
  inventory: {
    productId: PROD_PAN_ID,
    qtyBase: '200.0000',
    avgCostPerBaseBdt: '2.500000',
    valuationPoisha: 50000,
    version: 1,
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const lowStockSupariProduct: ProductDto = {
  ...panProduct,
  id: PROD_SUPARI_ID,
  nameBn: 'গুড়া সুপারি',
  nameEn: 'Crushed Supari',
  baseUnitId: UNIT_GRAM_ID,
  baseUnitCode: 'GRAM',
  baseUnitNameBn: 'গ্রাম',
  baseUnitNameEn: 'Gram',
  defaultSaleUnitId: UNIT_GRAM_ID,
  defaultPurchaseUnitId: UNIT_GRAM_ID,
  baseSellingPricePoisha: 100,
  lowStockThresholdBase: '500.0000',
  isLowStock: true,
  units: [
    {
      id: 'pu-3',
      productId: PROD_SUPARI_ID,
      unitId: UNIT_GRAM_ID,
      unitCode: 'GRAM',
      unitNameBn: 'গ্রাম',
      unitNameEn: 'Gram',
      isFractional: true,
      conversionFactorToBase: '1.0000',
      sellingPricePoisha: 100,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      isDefaultPurchaseUnit: true,
    },
  ],
  inventory: {
    productId: PROD_SUPARI_ID,
    qtyBase: '250.5000',
    avgCostPerBaseBdt: '0.600000',
    valuationPoisha: 15030,
    version: 1,
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
};

const createdClients: QueryClient[] = [];

async function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  createdClients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('Phase 3 Products, Flexible Units & Inventory Mobile UI', () => {
  afterEach(async () => {
    await cleanup();
    for (const c of createdClients) {
      c.unmount();
      c.clear();
    }
    createdClients.length = 0;
  });

  beforeEach(async () => {
    const webDb = await openPlatformSqliteDatabase();
    resetLocalDatabaseInstanceForTests(webDb);
    mockBack.mockReset();
    mockPush.mockReset();
    mockSearchParams = {};
    usePreferencesStore.getState().setLanguage('bn', false);
    usePreferencesStore.getState().setDigitStyle('bn');
    useAuthStore.setState({
      status: 'authenticated',
      user: sampleOwner,
      shop: sampleShop,
      hasOfflinePin: false,
      isOfflineSession: false,
    });
    jest.restoreAllMocks();
  });

  it('caches and queries categories, units, and multi-unit products in local SQLite', async () => {
    await saveLocalCategories(sampleCategories);
    await saveLocalUnits(sampleUnits);
    await replaceLocalProducts([panProduct, lowStockSupariProduct]);

    const cats = await loadLocalCategories(SHOP_ID);
    expect(cats).toHaveLength(1);
    expect(cats[0]?.nameBn).toBe('পান ও সুপারি');

    const units = await loadLocalUnits(SHOP_ID);
    expect(units).toHaveLength(3);

    const searchResult = await loadLocalProducts(SHOP_ID, { q: 'পান' });
    expect(searchResult).toHaveLength(1);
    expect(searchResult[0]?.id).toBe(PROD_PAN_ID);
    expect(searchResult[0]?.units).toHaveLength(2);

    const lowStockOnly = await loadLocalProducts(SHOP_ID, { lowStockOnly: true });
    expect(lowStockOnly).toHaveLength(1);
    expect(lowStockOnly[0]?.id).toBe(PROD_SUPARI_ID);

    const hydrated = await loadLocalProductById(PROD_PAN_ID);
    expect(hydrated?.inventory.qtyBase).toBe('200.0000');

    await clearLocalCatalogData();
    expect(await loadLocalProducts(SHOP_ID)).toHaveLength(0);
  });

  it('renders ProductsScreen for Owner with unit conversion stock display', async () => {
    jest.spyOn(catalogApi, 'listCategories').mockResolvedValue({ categories: sampleCategories });
    jest
      .spyOn(catalogApi, 'listProducts')
      .mockResolvedValue({ products: [panProduct, lowStockSupariProduct] });
    jest
      .spyOn(catalogApi, 'getLowStockAlerts')
      .mockResolvedValue({ products: [lowStockSupariProduct] });

    await renderWithQuery(<ProductsScreen />);

    await waitFor(() => {
      expect(screen.getByText('দেশি মিষ্টি পান')).toBeTruthy();
      expect(screen.getByText('২০০ টি (১০ বিড়া)')).toBeTruthy();
      expect(screen.getByText('+ পণ্য যোগ')).toBeTruthy();
    });
  });

  it('hides cost valuation and falls back to offline SQLite cache for Employee', async () => {
    useAuthStore.setState({ user: sampleEmployee });
    const empProduct: ProductDto = {
      ...panProduct,
      lastPurchasePricePoisha: null,
      inventory: {
        ...panProduct.inventory,
        avgCostPerBaseBdt: null,
        valuationPoisha: null,
      },
    };
    await saveLocalCategories(sampleCategories);
    await replaceLocalProducts([empProduct]);

    jest.spyOn(catalogApi, 'listCategories').mockRejectedValue(
      new ApiClientError({ code: 'NETWORK_ERROR', message: 'Offline', statusCode: 0 }),
    );
    jest.spyOn(catalogApi, 'listProducts').mockRejectedValue(
      new ApiClientError({ code: 'NETWORK_ERROR', message: 'Offline', statusCode: 0 }),
    );
    jest.spyOn(catalogApi, 'getLowStockAlerts').mockRejectedValue(
      new ApiClientError({ code: 'NETWORK_ERROR', message: 'Offline', statusCode: 0 }),
    );

    await renderWithQuery(<ProductsScreen />);

    await waitFor(() => {
      expect(screen.getByText('অফলাইন ক্যাশ থেকে দেখানো হচ্ছে')).toBeTruthy();
      expect(screen.getByText('দেশি মিষ্টি পান')).toBeTruthy();
      expect(screen.queryByText('+ পণ্য যোগ')).toBeNull();
    });
  });

  it('submits new Pan product with Bira conversion and Bangla-digit opening stock', async () => {
    jest.spyOn(catalogApi, 'listCategories').mockResolvedValue({ categories: sampleCategories });
    jest.spyOn(catalogApi, 'listUnits').mockResolvedValue({ units: sampleUnits });
    const createSpy = jest.spyOn(catalogApi, 'createProduct').mockResolvedValue({
      product: panProduct,
    });

    await renderWithQuery(<ProductFormScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('যেমন: দেশি মিষ্টি পান')).toBeTruthy();
    });

    await fireEvent.changeText(
      screen.getByPlaceholderText('যেমন: দেশি মিষ্টি পান'),
      'দেশি মিষ্টি পান',
    );
    await fireEvent.changeText(screen.getByPlaceholderText('১০.০০'), '১.৫০');
    await fireEvent.changeText(screen.getByPlaceholderText('১০'), '৪০');

    // Add Bira conversion rule (suggests 20 for PIECE -> BIRA)
    await fireEvent.press(screen.getByRole('button', { name: '+ অতিরিক্ত একক যোগ' }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('২০')).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nameBn: 'দেশি মিষ্টি পান',
          baseUnitId: UNIT_PIECE_ID,
          baseSellingPricePoisha: 150,
          lowStockThresholdBase: '40',
          units: expect.arrayContaining([
            expect.objectContaining({ unitId: UNIT_PIECE_ID, conversionFactorToBase: '1' }),
            expect.objectContaining({ unitId: UNIT_BIRA_ID, conversionFactorToBase: '20' }),
          ]),
        }),
      );
    });
  });

  it('records Pan wastage in Bira with live stock/loss preview and ConfirmDialog', async () => {
    mockSearchParams = { productId: PROD_PAN_ID };
    jest.spyOn(catalogApi, 'listProducts').mockResolvedValue({ products: [panProduct] });
    jest.spyOn(catalogApi, 'getProduct').mockResolvedValue({ product: panProduct });
    const adjustSpy = jest.spyOn(catalogApi, 'createAdjustment').mockResolvedValue({
      adjustment: {
        id: 'adj-1',
        shopId: SHOP_ID,
        productId: PROD_PAN_ID,
        productNameBn: 'দেশি মিষ্টি পান',
        productNameEn: 'Deshi Misti Pan',
        adjustmentType: 'WASTAGE',
        qtyBase: '40.0000',
        deltaQtyBase: '-40.0000',
        unitCostBdt: '2.500000',
        lossPoisha: 10000,
        reason: 'পান পচে গেছে',
        actorUserId: sampleOwner.id,
        actorName: sampleOwner.name,
        adjustedAt: '2026-11-12T00:00:00.000Z',
      },
      product: {
        ...panProduct,
        inventory: { ...panProduct.inventory, qtyBase: '160.0000', valuationPoisha: 40000 },
      },
      idempotencyReplayed: false,
    });

    await renderWithQuery(<StockAdjustmentScreen />);

    await waitFor(() => {
      expect(screen.getByText('দেশি মিষ্টি পান')).toBeTruthy();
    });

    // Enter 2 Bira wastage in Bangla digit ('২')
    await fireEvent.changeText(screen.getByPlaceholderText('৫'), '২');
    await fireEvent.changeText(
      screen.getByPlaceholderText('যেমন: পান পচে গেছে বা হাতে গননা মিলিয়ে নেওয়া'),
      'পান পচে গেছে',
    );

    await waitFor(() => {
      expect(screen.getByText(/সমন্বয়ের পর নতুন মজুত: ১৬০ টি/)).toBeTruthy();
      expect(screen.getByText(/আনুমানিক ক্ষতির পরিমাণ \(WAC অনুযায়ী\): ৳ ১০০/)).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'স্টক সমন্বয় নিশ্চিত করুন' }));
    await fireEvent.press(screen.getByRole('button', { name: 'নিশ্চিত করুন' }));

    await waitFor(() => {
      expect(adjustSpy).toHaveBeenCalledWith({
        productId: PROD_PAN_ID,
        adjustmentType: 'WASTAGE',
        unitId: UNIT_BIRA_ID,
        qtyDisplay: '2',
        reason: 'পান পচে গেছে',
      });
    });
  });
});
