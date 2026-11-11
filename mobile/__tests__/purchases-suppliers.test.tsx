import type {
  AuthUserDto,
  ProductDto,
  PurchaseDto,
  ShopProfileDto,
  SupplierDto,
  SupplierLedgerEntryDto,
} from '@dokanwala/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import PurchasesHistoryScreen from '@/app/purchases';
import PurchaseDetailScreen from '@/app/purchases/[id]';
import PurchaseFormScreen from '@/app/purchases/form';
import SuppliersDirectoryScreen from '@/app/suppliers';
import SupplierDetailScreen from '@/app/suppliers/[id]';
import {
  clearLocalPurchasesData,
  loadLocalPurchaseById,
  loadLocalPurchases,
  loadLocalSupplierLedger,
  loadLocalSuppliers,
  replaceLocalPurchases,
  saveLocalSupplierLedger,
  saveLocalSuppliers,
} from '@/database/repositories/purchases-local.repo';
import { resetLocalDatabaseInstanceForTests } from '@/database/sqlite';
import { openPlatformSqliteDatabase } from '@/database/sqlite-driver.web';
import { catalogApi } from '@/services/api/catalog';
import { ApiClientError } from '@/services/api/client';
import { purchasesApi, suppliersApi } from '@/services/api/purchases';
import { useAuthStore } from '@/store/auth.store';
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
const SUPPLIER_KARIM_ID = '77777777-7777-4777-8777-777777777771';
const PURCHASE_1_ID = '88888888-8888-4888-8888-888888888881';

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
  defaultSupplierName: 'করিম পান আড়ত',
  baseUnitId: UNIT_PIECE_ID,
  baseUnitCode: 'PIECE',
  baseUnitNameBn: 'টি',
  baseUnitNameEn: 'Piece',
  defaultSaleUnitId: UNIT_BIRA_ID,
  defaultPurchaseUnitId: UNIT_BIRA_ID,
  baseSellingPricePoisha: 150,
  lastPurchasePricePoisha: 100,
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
  baseSellingPricePoisha: 60,
  lastPurchasePricePoisha: 45,
  lowStockThresholdBase: '500.0000',
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

const karimSupplier: SupplierDto = {
  id: SUPPLIER_KARIM_ID,
  shopId: SHOP_ID,
  nameBn: 'করিম পান আড়ত',
  nameEn: 'Karim Pan Arot',
  phone: '+8801711223344',
  address: 'চকবাজার আড়ত',
  note: 'সাপ্তাহিক পানের চালান',
  totalPurchasedPoisha: 85000,
  totalPaidPoisha: 30000,
  payablePoisha: 55000,
  isActive: true,
  version: 1,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const samplePurchase: PurchaseDto = {
  id: PURCHASE_1_ID,
  shopId: SHOP_ID,
  purchaseNumber: 'PUR-20261112-0001',
  supplierId: SUPPLIER_KARIM_ID,
  supplierNameSnapshot: 'করিম পান আড়ত',
  status: 'COMPLETED',
  subtotalPoisha: 90000,
  discountPoisha: 5000,
  totalPoisha: 85000,
  paidPoisha: 30000,
  settledDuePoisha: 0,
  duePoisha: 55000,
  paymentMethod: 'CASH',
  paymentReference: null,
  returnedTotalPoisha: 0,
  cashRefundedPoisha: 0,
  note: 'সকালের পানের চালান',
  actorUserId: sampleOwner.id,
  actorName: sampleOwner.name,
  purchasedAt: '2026-11-12T07:00:00.000Z',
  createdAt: '2026-11-12T07:00:00.000Z',
  updatedAt: '2026-11-12T07:00:00.000Z',
  items: [
    {
      id: 'pitem-1',
      purchaseId: PURCHASE_1_ID,
      productId: PROD_PAN_ID,
      unitId: UNIT_BIRA_ID,
      productNameBn: 'দেশি মিষ্টি পান',
      productNameEn: 'Deshi Misti Pan',
      unitNameBn: 'বিড়া',
      unitNameEn: 'Bira',
      lineOrder: 0,
      qtyDisplay: '10.0000',
      conversionFactorToBase: '20.0000',
      qtyBase: '200.0000',
      returnedQtyBase: '0.0000',
      unitCostPoisha: 4000,
      lineTotalPoisha: 40000,
      netCostPoisha: 37778,
    },
    {
      id: 'pitem-2',
      purchaseId: PURCHASE_1_ID,
      productId: PROD_SUPARI_ID,
      unitId: UNIT_KG_ID,
      productNameBn: 'গুড়া সুপারি',
      productNameEn: 'Crushed Supari',
      unitNameBn: 'কেজি',
      unitNameEn: 'Kg',
      lineOrder: 1,
      qtyDisplay: '1.0000',
      conversionFactorToBase: '1000.0000',
      qtyBase: '1000.0000',
      returnedQtyBase: '0.0000',
      unitCostPoisha: 50000,
      lineTotalPoisha: 50000,
      netCostPoisha: 47222,
    },
  ],
  returns: [],
};

const sampleLedgerEntries: SupplierLedgerEntryDto[] = [
  {
    id: `purchase:${PURCHASE_1_ID}`,
    type: 'PURCHASE',
    referenceId: PURCHASE_1_ID,
    referenceNumber: 'PUR-20261112-0001',
    occurredAt: '2026-11-12T07:00:00.000Z',
    totalPoisha: 85000,
    paidOrRefundedPoisha: 30000,
    payableDeltaPoisha: 55000,
    runningPayablePoisha: 55000,
    method: 'CASH',
    note: 'সকালের পানের চালান',
  },
];

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

describe('Phase 5 Purchases, Suppliers & Payables Ledger UI', () => {
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

  it('persists and queries suppliers, ledgers, purchases, and returns in SQLite', async () => {
    await saveLocalSuppliers([karimSupplier]);
    await saveLocalSupplierLedger(karimSupplier, sampleLedgerEntries);
    await replaceLocalPurchases([samplePurchase]);

    const dueSuppliers = await loadLocalSuppliers(SHOP_ID, {
      q: 'করিম',
      withPayablesOnly: true,
    });
    expect(dueSuppliers).toHaveLength(1);
    expect(dueSuppliers[0]?.payablePoisha).toBe(55000);

    const ledger = await loadLocalSupplierLedger(SUPPLIER_KARIM_ID);
    expect(ledger?.entries).toHaveLength(1);
    expect(ledger?.entries[0]?.runningPayablePoisha).toBe(55000);

    const duePurchases = await loadLocalPurchases(SHOP_ID, {
      dueOnly: true,
      q: 'PUR-20261112',
    });
    expect(duePurchases).toHaveLength(1);
    expect(duePurchases[0]?.items).toHaveLength(2);

    const hydratedPurchase = await loadLocalPurchaseById(PURCHASE_1_ID);
    expect(hydratedPurchase?.supplierNameSnapshot).toBe('করিম পান আড়ত');

    await clearLocalPurchasesData();
    expect(await loadLocalPurchases(SHOP_ID)).toHaveLength(0);
    expect(await loadLocalSuppliers(SHOP_ID)).toHaveLength(0);
  });

  it('records multi-unit purchase with Bangla digits, live WAC preview, and credit supplier guard', async () => {
    jest.spyOn(suppliersApi, 'list').mockResolvedValue({ suppliers: [karimSupplier] });
    jest
      .spyOn(catalogApi, 'listProducts')
      .mockResolvedValue({ products: [panProduct, supariProduct] });
    const createPurchaseSpy = jest.spyOn(purchasesApi, 'create').mockResolvedValue({
      purchase: samplePurchase,
      idempotencyReplayed: false,
    });

    await renderWithQuery(<PurchaseFormScreen />);

    await waitFor(() => {
      expect(screen.getByTestId(`purchase-add-product-${PROD_PAN_ID}`)).toBeTruthy();
    });

    // Add Pan (defaults to বিড়া unit @ 20 BDT suggested cost)
    await fireEvent.press(screen.getByTestId(`purchase-add-product-${PROD_PAN_ID}`));

    // Change Pan qty to '১০' (10 বিড়া = 200 টি) & unit cost to '৪০' (40 BDT/Bira = 2 BDT/piece)
    await fireEvent.changeText(screen.getByLabelText('পরিমাণ (বিড়া)'), '১০');
    await fireEvent.changeText(screen.getByLabelText('প্রতি বিড়া ক্রয়মূল্য (৳)'), '৪০');

    // Moving WAC preview: (200*1 + 200*2) / 400 = 1.50 BDT/টি; stock: 200 টি -> 400 টি
    await waitFor(() => {
      expect(screen.getByText(/মজুত: ২০০ টি → ৪০০ টি/)).toBeTruthy();
      expect(screen.getByText(/নতুন গড় মূল্য \(WAC\): ৳ ১.৫০ \/ টি/)).toBeTruthy();
    });

    // Add Supari (defaults to কেজি, enter '১' @ '৫০০')
    await fireEvent.press(screen.getByTestId(`purchase-add-product-${PROD_SUPARI_ID}`));
    await fireEvent.changeText(screen.getByLabelText('পরিমাণ (কেজি)'), '১');
    await fireEvent.changeText(screen.getByLabelText('প্রতি কেজি ক্রয়মূল্য (৳)'), '৫০০');

    // Subtotal = 400 + 500 = 900 BDT. Apply 50 BDT discount -> net 850 BDT.
    await fireEvent.changeText(screen.getByLabelText('মোট চালান ছাড় (৳, ঐচ্ছিক)'), '৫০');

    // Enter partial payment '৩০০' WITHOUT selecting a supplier -> credit guard must block!
    await fireEvent.changeText(screen.getByLabelText('নগদ/অ্যাপে পরিশোধ (৳)'), '৩০০');
    await fireEvent.press(screen.getByTestId('purchase-submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('বাকি বা আংশিক পরিশোধের জন্য অবশ্যই মহাজন নির্বাচন করুন')).toBeTruthy();
    });
    expect(createPurchaseSpy).not.toHaveBeenCalled();

    // Pick Supplier Karim via SupplierPickerModal
    await fireEvent.press(screen.getByTestId('purchase-select-supplier-btn'));
    await waitFor(() => {
      expect(screen.getByTestId(`supplier-option-${SUPPLIER_KARIM_ID}`)).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId(`supplier-option-${SUPPLIER_KARIM_ID}`));

    // Submit valid purchase -> verifies normalized payload and route replace
    await fireEvent.press(screen.getByTestId('purchase-submit-btn'));

    await waitFor(() => {
      expect(createPurchaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: SUPPLIER_KARIM_ID,
          discountPoisha: 5000,
          paidPoisha: 30000,
          paymentMethod: 'CASH',
          items: [
            {
              productId: PROD_PAN_ID,
              unitId: UNIT_BIRA_ID,
              qtyDisplay: '10',
              unitCostPoisha: 4000,
            },
            {
              productId: PROD_SUPARI_ID,
              unitId: UNIT_KG_ID,
              qtyDisplay: '1',
              unitCostPoisha: 50000,
            },
          ],
        }),
        expect.any(String),
      );
      expect(mockReplace).toHaveBeenCalledWith(`/purchases/${PURCHASE_1_ID}`);
    });
  });

  it('displays Supplier Directory, Ledger, and submits Bangla supplier due payment', async () => {
    jest.spyOn(suppliersApi, 'list').mockResolvedValue({ suppliers: [karimSupplier] });
    await renderWithQuery(<SuppliersDirectoryScreen />);

    await waitFor(() => {
      expect(screen.getByText('করিম পান আড়ত')).toBeTruthy();
      expect(screen.getByText('১ জন সরবরাহকারী')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId(`supplier-card-${SUPPLIER_KARIM_ID}`));
    expect(mockPush).toHaveBeenCalledWith(`/suppliers/${SUPPLIER_KARIM_ID}`);

    await cleanup();
    mockSearchParams = { id: SUPPLIER_KARIM_ID };
    jest.spyOn(suppliersApi, 'getLedger').mockResolvedValue({
      supplier: karimSupplier,
      entries: sampleLedgerEntries,
    });
    const paySpy = jest.spyOn(suppliersApi, 'createPayment').mockResolvedValue({
      supplier: { ...karimSupplier, totalPaidPoisha: 60000, payablePoisha: 25000 },
      payment: {
        id: 'sp-1',
        shopId: SHOP_ID,
        supplierId: SUPPLIER_KARIM_ID,
        purchaseId: null,
        method: 'BKASH',
        amountPoisha: 30000,
        reference: 'TRX555',
        note: 'বাকি শোধ',
        actorUserId: sampleOwner.id,
        actorName: sampleOwner.name,
        paidAt: '2026-11-12T10:00:00.000Z',
        createdAt: '2026-11-12T10:00:00.000Z',
      },
      idempotencyReplayed: false,
    });

    await renderWithQuery(<SupplierDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('PUR-২০২৬১১১২-০০০১ • ১২ নভেম্বর ২০২৬, দুপুর ১:০০')).toBeTruthy();
      expect(screen.getByTestId('supplier-pay-due-btn')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('supplier-pay-due-btn'));
    await fireEvent.changeText(screen.getByLabelText('পরিশোধের পরিমাণ (৳) *'), '৩০০');
    await fireEvent.press(screen.getByRole('button', { name: 'বিকাশ' }));
    await fireEvent.changeText(screen.getByLabelText('রেফারেন্স / ট্রানজেকশন নং (ঐচ্ছিক)'), 'TRX555');
    await fireEvent.press(screen.getByTestId('supplier-payment-submit-btn'));

    await waitFor(() => {
      expect(paySpy).toHaveBeenCalledWith(
        SUPPLIER_KARIM_ID,
        {
          method: 'BKASH',
          amountPoisha: 30000,
          reference: 'TRX555',
        },
        expect.any(String),
      );
    });
  });

  it('falls back to SQLite purchases offline and submits partial Purchase Return', async () => {
    await replaceLocalPurchases([samplePurchase]);
    jest
      .spyOn(purchasesApi, 'list')
      .mockRejectedValue(
        new ApiClientError({ code: 'NETWORK_ERROR', message: 'Offline', statusCode: 0 }),
      );

    await renderWithQuery(<PurchasesHistoryScreen />);

    await waitFor(() => {
      expect(screen.getByText('অফলাইন ক্যাশ থেকে দেখানো হচ্ছে')).toBeTruthy();
      expect(screen.getByText('PUR-২০২৬১১১২-০০০১')).toBeTruthy();
    });

    await cleanup();
    mockSearchParams = { id: PURCHASE_1_ID };
    jest.spyOn(purchasesApi, 'get').mockResolvedValue({ purchase: samplePurchase });
    jest.spyOn(suppliersApi, 'getLedger').mockResolvedValue({
      supplier: karimSupplier,
      entries: sampleLedgerEntries,
    });
    const returnSpy = jest.spyOn(purchasesApi, 'createReturn').mockResolvedValue({
      purchase: {
        ...samplePurchase,
        status: 'PARTIALLY_RETURNED',
        returnedTotalPoisha: 7556,
        duePoisha: 47444,
      },
      purchaseReturn: {
        id: 'pret-1',
        purchaseId: PURCHASE_1_ID,
        returnNumber: 'PRET-20261112-0001',
        refundMethod: 'PAYABLE_ADJUSTMENT',
        subtotalPoisha: 8000,
        discountAdjustmentPoisha: 444,
        refundTotalPoisha: 7556,
        cashRefundPoisha: 0,
        payableAdjustedPoisha: 7556,
        reason: 'পাতা পচা',
        actorUserId: sampleOwner.id,
        actorName: sampleOwner.name,
        returnedAt: '2026-11-12T11:00:00.000Z',
        items: [],
      },
      idempotencyReplayed: false,
    });

    await renderWithQuery(<PurchaseDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('purchase-return-open-btn')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('purchase-return-open-btn'));

    await waitFor(() => {
      expect(screen.getByText('মহাজনকে মাল ফেরত (Purchase Return)')).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByLabelText('ফেরত পরিমাণ (বিড়া)'), '২');
    await fireEvent.changeText(
      screen.getByPlaceholderText('যেমন: পাতা পচে গেছে বা ওজনে কম'),
      'পাতা পচা',
    );
    await fireEvent.press(screen.getByTestId('purchase-return-submit-btn'));

    await waitFor(() => {
      expect(returnSpy).toHaveBeenCalledWith(
        PURCHASE_1_ID,
        {
          refundMethod: 'PAYABLE_ADJUSTMENT',
          items: [{ purchaseItemId: 'pitem-1', qtyDisplay: '2' }],
          reason: 'পাতা পচা',
        },
        expect.any(String),
      );
    });
  });

  it('enforces OWNER-only RBAC guard across Suppliers and Purchases screens for EMPLOYEE', async () => {
    useAuthStore.setState({ user: sampleEmployee });
    const supListSpy = jest.spyOn(suppliersApi, 'list');
    const purListSpy = jest.spyOn(purchasesApi, 'list');

    await renderWithQuery(<SuppliersDirectoryScreen />);
    expect(screen.getByText('এই কাজটি শুধুমাত্র দোকানের মালিক করতে পারবেন।')).toBeTruthy();

    await cleanup();
    await renderWithQuery(<PurchasesHistoryScreen />);
    expect(screen.getByText('এই কাজটি শুধুমাত্র দোকানের মালিক করতে পারবেন।')).toBeTruthy();

    await cleanup();
    await renderWithQuery(<PurchaseFormScreen />);
    expect(screen.getByText('এই কাজটি শুধুমাত্র দোকানের মালিক করতে পারবেন।')).toBeTruthy();

    expect(supListSpy).not.toHaveBeenCalled();
    expect(purListSpy).not.toHaveBeenCalled();
  });
});
