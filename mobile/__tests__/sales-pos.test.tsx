import type {
  AuthUserDto,
  CategoryDto,
  CustomerDto,
  ProductDto,
  SaleDto,
  ShopProfileDto,
} from '@dokanwala/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Share } from 'react-native';
import SalesPosScreen from '@/app/(tabs)/sales';
import SaleDetailScreen from '@/app/sales/[id]';
import SalesHistoryScreen from '@/app/sales/history';
import ReceiptScreen from '@/app/sales/receipt';
import {
  clearLocalSalesData,
  loadLocalCustomers,
  loadLocalSaleById,
  loadLocalSales,
  replaceLocalSales,
  saveLocalCustomers,
} from '@/database/repositories/sales-local.repo';
import { resetLocalDatabaseInstanceForTests } from '@/database/sqlite';
import { openPlatformSqliteDatabase } from '@/database/sqlite-driver.web';
import { catalogApi } from '@/services/api/catalog';
import { ApiClientError } from '@/services/api/client';
import { customersApi, salesApi } from '@/services/api/sales';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { usePreferencesStore } from '@/store/preferences.store';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

const SHOP_ID = '11111111-1111-4111-8111-111111111111';
const CAT_PAN_ID = '22222222-2222-4222-8222-222222222221';
const UNIT_PIECE_ID = '33333333-3333-4333-8333-333333333331';
const UNIT_BIRA_ID = '33333333-3333-4333-8333-333333333332';
const UNIT_GRAM_ID = '33333333-3333-4333-8333-333333333333';
const UNIT_KG_ID = '33333333-3333-4333-8333-333333333334';
const PROD_PAN_ID = '44444444-4444-4444-8444-444444444441';
const PROD_SUPARI_ID = '44444444-4444-4444-8444-444444444442';
const CUST_JAMAL_ID = '55555555-5555-4555-8555-555555555551';
const SALE_1_ID = '66666666-6666-4666-8666-666666666661';

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
  addressEn: 'Chawkbazar, Dhaka',
  phone: '+8801711223344',
  logoUrl: null,
  currencyCode: 'BDT',
  timezone: 'Asia/Dhaka',
  defaultLanguage: 'bn',
  defaultDigitStyle: 'bn',
  receiptHeaderBn: 'বিসমিল্লাহির রাহমানির রাহিম',
  receiptFooterBn: 'ধন্যবাদ, আবার আসবেন।',
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
  lastPurchasePricePoisha: 2000,
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
    avgCostPerBaseBdt: '1.000000',
    valuationPoisha: 20000,
    version: 1,
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const supariProduct: ProductDto = {
  ...panProduct,
  id: PROD_SUPARI_ID,
  nameBn: 'গুড়া সুপারি',
  nameEn: 'Crushed Supari',
  baseUnitId: UNIT_GRAM_ID,
  baseUnitCode: 'GRAM',
  baseUnitNameBn: 'গ্রাম',
  baseUnitNameEn: 'Gram',
  defaultSaleUnitId: UNIT_KG_ID,
  defaultPurchaseUnitId: UNIT_KG_ID,
  baseSellingPricePoisha: 60, // 0.60 BDT / gram => 600 BDT / kg
  lowStockThresholdBase: '500.0000',
  isLowStock: false,
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
      sellingPricePoisha: 60,
      isBaseUnit: true,
      isDefaultSaleUnit: false,
      isDefaultPurchaseUnit: false,
    },
    {
      id: 'pu-4',
      productId: PROD_SUPARI_ID,
      unitId: UNIT_KG_ID,
      unitCode: 'KG',
      unitNameBn: 'কেজি',
      unitNameEn: 'Kg',
      isFractional: true,
      conversionFactorToBase: '1000.0000',
      sellingPricePoisha: 60000,
      isBaseUnit: false,
      isDefaultSaleUnit: true,
      isDefaultPurchaseUnit: true,
    },
  ],
  inventory: {
    productId: PROD_SUPARI_ID,
    qtyBase: '5000.0000',
    avgCostPerBaseBdt: '0.450000',
    valuationPoisha: 225000,
    version: 1,
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
};

const jamalCustomer: CustomerDto = {
  id: CUST_JAMAL_ID,
  shopId: SHOP_ID,
  nameBn: 'মো: জামাল উদ্দিন',
  nameEn: 'Md. Jamal Uddin',
  phone: '+8801711223344',
  address: 'দক্ষিণ বাজার',
  note: null,
  totalPurchasedPoisha: 10000,
  totalPaidPoisha: 5000,
  duePoisha: 5000,
  isActive: true,
  version: 1,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleSale: SaleDto = {
  id: SALE_1_ID,
  shopId: SHOP_ID,
  receiptNumber: 'INV-20261112-0001',
  customerId: CUST_JAMAL_ID,
  customerNameSnapshot: 'মো: জামাল উদ্দিন',
  status: 'COMPLETED',
  subtotalPoisha: 18250,
  discountType: 'FIXED_POISHA',
  discountValue: '250.00',
  discountPoisha: 250,
  totalPoisha: 18000,
  paidPoisha: 13000,
  duePoisha: 5000,
  tenderedPoisha: 10000,
  changePoisha: 2000,
  returnedTotalPoisha: 0,
  cashRefundedPoisha: 0,
  cogsPoisha: 13250,
  estimatedProfitPoisha: 4750,
  note: null,
  actorUserId: sampleOwner.id,
  actorName: sampleOwner.name,
  cancelledAt: null,
  cancelReason: null,
  soldAt: '2026-11-12T09:30:00.000Z',
  createdAt: '2026-11-12T09:30:00.000Z',
  updatedAt: '2026-11-12T09:30:00.000Z',
  items: [
    {
      id: 'si-1',
      saleId: SALE_1_ID,
      productId: PROD_PAN_ID,
      unitId: UNIT_BIRA_ID,
      productNameBn: 'দেশি মিষ্টি পান',
      productNameEn: 'Deshi Misti Pan',
      unitNameBn: 'বিড়া',
      unitNameEn: 'Bira',
      qtyDisplay: '1.0000',
      conversionFactorToBase: '20.0000',
      qtyBase: '20.0000',
      returnedQtyBase: '0.0000',
      unitSellingPricePoisha: 2500,
      unitCostAtSaleBdt: '1.000000',
      lineSubtotalPoisha: 2500,
      lineCogsPoisha: 2000,
    },
    {
      id: 'si-2',
      saleId: SALE_1_ID,
      productId: PROD_PAN_ID,
      unitId: UNIT_PIECE_ID,
      productNameBn: 'দেশি মিষ্টি পান',
      productNameEn: 'Deshi Misti Pan',
      unitNameBn: 'টি',
      unitNameEn: 'Piece',
      qtyDisplay: '5.0000',
      conversionFactorToBase: '1.0000',
      qtyBase: '5.0000',
      returnedQtyBase: '0.0000',
      unitSellingPricePoisha: 150,
      unitCostAtSaleBdt: '1.000000',
      lineSubtotalPoisha: 750,
      lineCogsPoisha: 500,
    },
    {
      id: 'si-3',
      saleId: SALE_1_ID,
      productId: PROD_SUPARI_ID,
      unitId: UNIT_KG_ID,
      productNameBn: 'গুড়া সুপারি',
      productNameEn: 'Crushed Supari',
      unitNameBn: 'কেজি',
      unitNameEn: 'Kg',
      qtyDisplay: '0.2500',
      conversionFactorToBase: '1000.0000',
      qtyBase: '250.0000',
      returnedQtyBase: '0.0000',
      unitSellingPricePoisha: 60000,
      unitCostAtSaleBdt: '0.450000',
      lineSubtotalPoisha: 15000,
      lineCogsPoisha: 10750,
    },
  ],
  payments: [
    {
      id: 'pay-1',
      saleId: SALE_1_ID,
      method: 'CASH',
      amountPoisha: 8000,
      reference: null,
      receivedAt: '2026-11-12T09:30:00.000Z',
    },
    {
      id: 'pay-2',
      saleId: SALE_1_ID,
      method: 'BKASH',
      amountPoisha: 5000,
      reference: 'TRX9988',
      receivedAt: '2026-11-12T09:30:00.000Z',
    },
  ],
  returns: [],
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

describe('Phase 4 Sales, POS, Credit Baki, Returns & Bangla Receipt UI', () => {
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
    useCartStore.getState().clearCart();
    mockBack.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
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

  it('persists and queries customers, sales, payments, and returns in SQLite', async () => {
    await saveLocalCustomers([jamalCustomer]);
    await replaceLocalSales([sampleSale]);

    const customers = await loadLocalCustomers(SHOP_ID, { q: 'জামাল', withDuesOnly: true });
    expect(customers).toHaveLength(1);
    expect(customers[0]?.duePoisha).toBe(5000);

    const salesDue = await loadLocalSales(SHOP_ID, { dueOnly: true, q: 'INV-20261112' });
    expect(salesDue).toHaveLength(1);
    expect(salesDue[0]?.items).toHaveLength(3);
    expect(salesDue[0]?.payments).toHaveLength(2);

    const hydrated = await loadLocalSaleById(SALE_1_ID);
    expect(hydrated?.receiptNumber).toBe('INV-20261112-0001');

    await clearLocalSalesData();
    expect(await loadLocalSales(SHOP_ID)).toHaveLength(0);
    expect(await loadLocalCustomers(SHOP_ID)).toHaveLength(0);
  });

  it('builds multi-unit Pan & fractional Supari cart and submits split Cash+bKash checkout', async () => {
    jest.spyOn(catalogApi, 'listCategories').mockResolvedValue({ categories: sampleCategories });
    jest
      .spyOn(catalogApi, 'listProducts')
      .mockResolvedValue({ products: [panProduct, supariProduct] });
    const createSaleSpy = jest.spyOn(salesApi, 'create').mockResolvedValue({
      sale: sampleSale,
      idempotencyReplayed: false,
    });

    await renderWithQuery(<SalesPosScreen />);

    await waitFor(() => {
      expect(screen.getByTestId(`pos-product-${PROD_PAN_ID}`)).toBeTruthy();
    });

    // Tap Pan (adds 1 Bira = ৳ 25) and Supari (adds 1 Kg = ৳ 600)
    await fireEvent.press(screen.getByTestId(`pos-product-${PROD_PAN_ID}`));
    await fireEvent.press(screen.getByTestId(`pos-product-${PROD_SUPARI_ID}`));

    // Add second Pan unit (টি) for 1 Bira + 5 Pieces
    const otherUnitButtons = screen.getAllByRole('button', { name: '+ অন্য একক' });
    const firstOtherUnitButton = otherUnitButtons[0];
    if (!firstOtherUnitButton) throw new Error('Expected + অন্য একক button');
    await fireEvent.press(firstOtherUnitButton);
    await fireEvent.changeText(screen.getByLabelText('দেশি মিষ্টি পান (টি) পরিমাণ'), '৫');

    // Change Supari Kg quantity to 0.25 via Bangla decimal '০.২৫' -> 150 BDT
    await fireEvent.changeText(screen.getByLabelText('গুড়া সুপারি (কেজি) পরিমাণ'), '০.২৫');

    // 25 + (5 * 1.5) + (0.25 * 600) = 25 + 7.5 + 150 = 182.50 BDT
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'পেমেন্ট ও বিল করুন (৳ ১৮২.৫০)' })).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'পেমেন্ট ও বিল করুন (৳ ১৮২.৫০)' }));

    // Apply 2.50 BDT discount -> net 180 BDT
    await fireEvent.changeText(screen.getByLabelText('ছাড় (Discount)'), '২.৫০');
    await fireEvent.press(screen.getByRole('button', { name: 'সম্পূর্ণ নগদ' }));

    // Split payment: 100 Cash + 80 bKash with 120 Cash tendered
    await fireEvent.changeText(screen.getByLabelText('পরিমাণ (৳) 1'), '১০০');
    await fireEvent.press(screen.getByRole('button', { name: '+ আরেকটি পেমেন্ট' }));
    await fireEvent.changeText(screen.getByLabelText('পরিমাণ (৳) 2'), '৮০');
    await fireEvent.changeText(screen.getByPlaceholderText('ঐচ্ছিক — ভাংতি হিসাবের জন্য'), '১২০');

    await waitFor(() => {
      expect(screen.getByText(/ক্রেতাকে ফেরত \(ভাংতি\): ৳ ২০/)).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'বিক্রি সম্পন্ন করুন' }));

    await waitFor(() => {
      expect(createSaleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          discountType: 'FIXED_POISHA',
          discountValue: '250',
          tenderedPoisha: 12000,
          items: [
            { productId: PROD_PAN_ID, unitId: UNIT_BIRA_ID, qtyDisplay: '1' },
            { productId: PROD_SUPARI_ID, unitId: UNIT_KG_ID, qtyDisplay: '0.25' },
            { productId: PROD_PAN_ID, unitId: UNIT_PIECE_ID, qtyDisplay: '5' },
          ],
          payments: [
            { method: 'CASH', amountPoisha: 10000 },
            { method: 'BKASH', amountPoisha: 8000 },
          ],
        }),
        expect.any(String),
      );
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/sales/receipt',
        params: { saleId: SALE_1_ID },
      });
    });
  });

  it('enforces Employee discount cap and credit customer requirement with quick-create', async () => {
    useAuthStore.setState({ user: sampleEmployee });
    jest.spyOn(catalogApi, 'listCategories').mockResolvedValue({ categories: sampleCategories });
    jest.spyOn(catalogApi, 'listProducts').mockResolvedValue({ products: [panProduct] });
    jest.spyOn(customersApi, 'list').mockResolvedValue({ customers: [] });
    const createCustSpy = jest
      .spyOn(customersApi, 'create')
      .mockResolvedValue({ customer: jamalCustomer });
    const createSaleSpy = jest.spyOn(salesApi, 'create').mockResolvedValue({
      sale: sampleSale,
      idempotencyReplayed: false,
    });

    await renderWithQuery(<SalesPosScreen />);

    await waitFor(() => {
      expect(screen.getByTestId(`pos-product-${PROD_PAN_ID}`)).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId(`pos-product-${PROD_PAN_ID}`));
    await fireEvent.press(screen.getByRole('button', { name: 'পেমেন্ট ও বিল করুন (৳ ২৫)' }));

    // Try 20% discount (> 10% cap for Employee)
    await fireEvent.press(screen.getByRole('button', { name: 'শতাংশ (%)' }));
    await fireEvent.changeText(screen.getByLabelText('ছাড় (Discount)'), '২০');
    await fireEvent.press(screen.getByRole('button', { name: 'বিক্রি সম্পন্ন করুন' }));

    await waitFor(() => {
      expect(screen.getByText('কর্মচারী সর্বোচ্চ ১০% পর্যন্ত ছাড় দিতে পারবেন')).toBeTruthy();
    });
    expect(createSaleSpy).not.toHaveBeenCalled();

    // Fix discount to 0 and select full credit (বাকি) without selecting customer
    await fireEvent.changeText(screen.getByLabelText('ছাড় (Discount)'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'পুরোটা বাকি' }));
    await fireEvent.press(screen.getByRole('button', { name: 'বিক্রি সম্পন্ন করুন' }));

    await waitFor(() => {
      expect(screen.getByText('বাকি বা আংশিক পেমেন্টের জন্য অবশ্যই ক্রেতা নির্বাচন করুন')).toBeTruthy();
    });

    // Open Customer picker -> Quick create Jamal -> auto-selected -> Complete Sale
    await fireEvent.press(screen.getByTestId('checkout-select-customer-btn'));
    await fireEvent.press(screen.getByRole('button', { name: '+ নতুন ক্রেতা যোগ' }));
    await fireEvent.changeText(
      screen.getByPlaceholderText('যেমন: মো: জামাল উদ্দিন'),
      'মো: জামাল উদ্দিন',
    );
    await fireEvent.changeText(screen.getByPlaceholderText('০১৭XXXXXXXX'), '০১৭১১২২৩৩৪৪');
    await fireEvent.press(screen.getByRole('button', { name: 'ক্রেতা সংরক্ষণ ও নির্বাচন করুন' }));

    await waitFor(() => {
      expect(createCustSpy).toHaveBeenCalledWith({
        nameBn: 'মো: জামাল উদ্দিন',
        phone: '০১৭১১২২৩৩৪৪',
      });
    });

    await fireEvent.press(screen.getByRole('button', { name: 'বিক্রি সম্পন্ন করুন' }));

    await waitFor(() => {
      expect(createSaleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: CUST_JAMAL_ID,
          payments: [],
        }),
        expect.any(String),
      );
    });
  });

  it('falls back to SQLite sales history offline and handles Owner returns & cancel', async () => {
    await replaceLocalSales([sampleSale]);
    jest
      .spyOn(salesApi, 'list')
      .mockRejectedValue(
        new ApiClientError({ code: 'NETWORK_ERROR', message: 'Offline', statusCode: 0 }),
      );

    await renderWithQuery(<SalesHistoryScreen />);

    await waitFor(() => {
      expect(screen.getByText('অফলাইন ক্যাশ থেকে দেখানো হচ্ছে')).toBeTruthy();
      expect(screen.getByText('INV-২০২৬১১১২-০০০১')).toBeTruthy();
    });

    // Clean unmount & test Employee vs Owner visibility + Return modal on SaleDetailScreen
    await cleanup();
    mockSearchParams = { id: SALE_1_ID };

    const empSale: SaleDto = {
      ...sampleSale,
      cogsPoisha: null,
      estimatedProfitPoisha: null,
    };
    jest.spyOn(salesApi, 'get').mockResolvedValue({ sale: empSale });
    useAuthStore.setState({ user: sampleEmployee });

    await renderWithQuery(<SaleDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('INV-২০২৬১১১২-০০০১')).toBeTruthy();
      expect(screen.queryByText(/মোট ক্রয়মূল্য/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'বিক্রি বাতিল করুন' })).toBeNull();
    });

    await cleanup();
    useAuthStore.setState({ user: sampleOwner });
    jest.spyOn(salesApi, 'get').mockResolvedValue({ sale: sampleSale });
    const cancelSpy = jest.spyOn(salesApi, 'cancel').mockResolvedValue({
      sale: { ...sampleSale, status: 'CANCELLED', cancelReason: 'ভুল রসিদ' },
      idempotencyReplayed: false,
    });

    await renderWithQuery(<SaleDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('খরচ ও লাভের হিসাব (মালিক)')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'বিক্রি বাতিল করুন' })).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'বিক্রি বাতিল করুন' }));
    await fireEvent.changeText(screen.getByPlaceholderText('যেমন: ভুল রসিদ তৈরি হয়েছিল'), 'ভুল রসিদ');
    await fireEvent.press(screen.getByRole('button', { name: 'নিশ্চিত করুন' }));

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledWith(SALE_1_ID, { reason: 'ভুল রসিদ' }, expect.any(String));
    });
  });

  it('submits partial sales return with Bangla digits via ReturnItemsModal', async () => {
    mockSearchParams = { id: SALE_1_ID };
    jest.spyOn(salesApi, 'get').mockResolvedValue({ sale: sampleSale });
    const returnSpy = jest.spyOn(salesApi, 'createReturn').mockResolvedValue({
      sale: {
        ...sampleSale,
        status: 'PARTIALLY_RETURNED',
        returnedTotalPoisha: 2466,
      },
      saleReturn: {
        id: 'ret-1',
        saleId: SALE_1_ID,
        returnNumber: 'RET-20261112-0001',
        refundMethod: 'CREDIT_ADJUSTMENT',
        subtotalPoisha: 2500,
        discountAdjustmentPoisha: 34,
        refundTotalPoisha: 2466,
        cashRefundPoisha: 0,
        creditAdjustedPoisha: 2466,
        reason: 'পাতা নষ্ট',
        actorUserId: sampleOwner.id,
        actorName: sampleOwner.name,
        returnedAt: '2026-11-12T10:00:00.000Z',
        items: [],
      },
      idempotencyReplayed: false,
    });

    await renderWithQuery(<SaleDetailScreen />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'পণ্য ফেরত নিন' })).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'পণ্য ফেরত নিন' }));

    await waitFor(() => {
      expect(screen.getByText('পণ্য ফেরত (Sales Return)')).toBeTruthy();
    });

    const qtyInputs = screen.getAllByPlaceholderText('০');
    const firstReturnInput = qtyInputs[0];
    if (!firstReturnInput) throw new Error('Expected return qty input');
    await fireEvent.changeText(firstReturnInput, '১');

    await fireEvent.changeText(
      screen.getByPlaceholderText('যেমন: পাতা নষ্ট ছিল বা ক্রেতা ফেরত দিয়েছেন'),
      'পাতা নষ্ট',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }));

    await waitFor(() => {
      expect(returnSpy).toHaveBeenCalledWith(
        SALE_1_ID,
        {
          refundMethod: 'CREDIT_ADJUSTMENT',
          items: [{ saleItemId: 'si-1', qtyDisplay: '1' }],
          reason: 'পাতা নষ্ট',
        },
        expect.any(String),
      );
    });
  });

  it('renders Bangla ReceiptScreen and shares formatted receipt text', async () => {
    mockSearchParams = { saleId: SALE_1_ID };
    jest.spyOn(salesApi, 'get').mockResolvedValue({ sale: sampleSale });
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });

    await renderWithQuery(<ReceiptScreen />);

    await waitFor(() => {
      expect(screen.getByText('রহিম পান ও মুদি স্টোর')).toBeTruthy();
      expect(screen.getByText(/INV-২০২৬১১১২-০০০১/)).toBeTruthy();
      expect(screen.getByText('ধন্যবাদ, আবার আসবেন।')).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'রসিদ শেয়ার / কপি করুন' }));

    await waitFor(() => {
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('রহিম পান ও মুদি স্টোর'),
        }),
      );
    });
  });
});
