import {
  getDhakaYmd,
  type AuthUserDto,
  type CashbookSummaryResponse,
  type DashboardSummaryResponse,
  type DuesReportResponse,
  type InventoryValuationSummaryDto,
  type ProductsReportResponse,
  type ProfitLossReportResponse,
  type SalesReportResponse,
  type ShopProfileDto,
} from '@dokanwala/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import HomeScreen from '@/app/(tabs)/index';
import ReportsScreen from '@/app/(tabs)/reports';
import CashbookScreen from '@/app/cashbook';
import {
  clearLocalCashbookReportsData,
  loadLocalCashbookSummary,
  loadLocalReportSnapshot,
  saveLocalCashbookSummary,
  saveLocalReportSnapshot,
} from '@/database/repositories/cashbook-reports-local.repo';
import { resetLocalDatabaseInstanceForTests } from '@/database/sqlite';
import { openPlatformSqliteDatabase } from '@/database/sqlite-driver.web';
import bnTranslations from '@/i18n/bn.json';
import enTranslations from '@/i18n/en.json';
import { cashbookApi } from '@/services/api/cashbook';
import { catalogApi } from '@/services/api/catalog';
import { ApiClientError } from '@/services/api/client';
import { reportsApi } from '@/services/api/reports';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => ({}),
}));

const SHOP_ID = '11111111-1111-4111-8111-111111111111';
const TODAY_YMD = getDhakaYmd();

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

const sampleOwnerDashboard: DashboardSummaryResponse = {
  businessDate: TODAY_YMD,
  todaySalesPoisha: 45000,
  todaySalesCount: 3,
  todayReturnsPoisha: 5000,
  todayNetSalesPoisha: 40000,
  todayCogsPoisha: 24000,
  todayGrossProfitPoisha: 16000,
  todayWastageLossPoisha: 1000,
  todayExpensesPoisha: 3000,
  todayNetProfitPoisha: 12000,
  todayCashReceivedPoisha: 35000,
  todayDueGivenPoisha: 5000,
  todayDueCollectedPoisha: 2000,
  totalProducts: 18,
  lowStockCount: 2,
  customerDueTotalPoisha: 125000,
  supplierPayableTotalPoisha: 85000,
  cashbookStatus: 'OPEN',
  cashbookExpectedCashPoisha: 132000,
  recentTransactions: [
    {
      id: 'sale:s1',
      kind: 'SALE',
      title: 'INV-001',
      subtitle: 'জামাল উদ্দিন',
      amountPoisha: 15000,
      direction: 'IN',
      occurredAt: '2026-11-12T08:30:00.000Z',
      referenceId: 's1',
    },
  ],
};

const sampleSalesReport: SalesReportResponse = {
  period: 'daily',
  fromDate: TODAY_YMD,
  toDate: TODAY_YMD,
  totals: {
    salesCount: 3,
    grossSalesPoisha: 46000,
    discountsPoisha: 1000,
    returnsPoisha: 5000,
    netSalesPoisha: 40000,
    cashAndMfsReceivedPoisha: 35000,
    creditIssuedPoisha: 5000,
    dueCollectedPoisha: 2000,
    cogsPoisha: 24000,
    grossProfitPoisha: 16000,
  },
  paymentBreakdown: {
    cashPoisha: 25000,
    bkashPoisha: 8000,
    nagadPoisha: 2000,
    otherPoisha: 0,
  },
  buckets: [
    {
      bucketKey: TODAY_YMD,
      label: TODAY_YMD,
      salesCount: 3,
      grossSalesPoisha: 46000,
      discountsPoisha: 1000,
      returnsPoisha: 5000,
      netSalesPoisha: 40000,
      cashAndMfsReceivedPoisha: 35000,
      creditIssuedPoisha: 5000,
      cogsPoisha: 24000,
      grossProfitPoisha: 16000,
    },
  ],
};

const samplePnlReport: ProfitLossReportResponse = {
  fromDate: TODAY_YMD,
  toDate: TODAY_YMD,
  grossSalesPoisha: 46000,
  discountsPoisha: 1000,
  salesReturnsPoisha: 5000,
  netSalesPoisha: 40000,
  grossCogsPoisha: 27000,
  restoredCogsPoisha: 3000,
  netCogsPoisha: 24000,
  grossProfitPoisha: 16000,
  wastageLossPoisha: 1000,
  damageLossPoisha: 0,
  expiredLossPoisha: 0,
  countShrinkageLossPoisha: 0,
  totalInventoryLossPoisha: 1000,
  totalOperatingExpensesPoisha: 3000,
  expensesByCategory: [
    {
      categoryId: 'cat-1',
      categoryNameBn: 'চা ও নাস্তা',
      amountPoisha: 3000,
    },
  ],
  netProfitPoisha: 12000,
  purchasesSummary: {
    purchaseCount: 1,
    grossPurchasesPoisha: 50000,
    purchaseDiscountsPoisha: 0,
    purchaseReturnsPoisha: 0,
    netPurchasesPoisha: 50000,
    cashPaidToSuppliersPoisha: 30000,
  },
};

const sampleProductsReport: ProductsReportResponse = {
  fromDate: TODAY_YMD,
  toDate: TODAY_YMD,
  totalGrossItemRevenuePoisha: 46000,
  totalReturnedItemRevenuePoisha: 5000,
  totalNetItemRevenuePoisha: 41000,
  totalInvoiceDiscountsNetPoisha: 1000,
  totalNetSalesPoisha: 40000,
  totalNetCogsPoisha: 24000,
  totalGrossProfitPoisha: 16000,
  items: [
    {
      productId: 'p1',
      productNameBn: 'বাংলা মিষ্টি পান',
      productNameEn: 'Bangla Misti Pan',
      baseUnitNameBn: 'পিস',
      soldQtyBase: '100.0000',
      returnedQtyBase: '10.0000',
      netQtyBase: '90.0000',
      grossRevenuePoisha: 46000,
      returnedRevenuePoisha: 5000,
      netRevenuePoisha: 41000,
      netCogsPoisha: 24000,
      grossProfitPoisha: 17000,
    },
  ],
};

const sampleDuesReport: DuesReportResponse = {
  totalCustomerDuePoisha: 125000,
  customersWithDueCount: 1,
  customers: [
    {
      customerId: 'c1',
      nameBn: 'মো: জামাল উদ্দিন',
      nameEn: 'Md. Jamal Uddin',
      phone: '+8801711000011',
      totalPurchasedPoisha: 200000,
      totalPaidPoisha: 75000,
      duePoisha: 125000,
    },
  ],
  totalSupplierPayablePoisha: 85000,
  suppliersWithPayableCount: 1,
  suppliers: [
    {
      supplierId: 'sup-1',
      nameBn: 'যশোর পান আড়ত',
      nameEn: 'Jessore Pan Arot',
      phone: '+8801722330330',
      totalPurchasedPoisha: 150000,
      totalPaidPoisha: 65000,
      payablePoisha: 85000,
    },
  ],
};

const sampleValuation: InventoryValuationSummaryDto = {
  totalActiveProducts: 18,
  lowStockCount: 2,
  outOfStockCount: 1,
  totalValuationPoisha: 450000,
  items: [],
};

const unopenedCashbook: CashbookSummaryResponse = {
  businessDate: TODAY_YMD,
  session: null,
  totals: {
    cashInPoisha: 0,
    cashOutPoisha: 0,
    netCashPoisha: 0,
    bkashInPoisha: 0,
    bkashOutPoisha: 0,
    netBkashPoisha: 0,
    nagadInPoisha: 0,
    nagadOutPoisha: 0,
    netNagadPoisha: 0,
    otherInPoisha: 0,
    otherOutPoisha: 0,
    netOtherPoisha: 0,
    totalInPoisha: 0,
    totalOutPoisha: 0,
    netAllMethodsPoisha: 0,
  },
  liveExpectedClosingCashPoisha: 0,
  previousClosedCashPoisha: 50000, // ৳500
  entries: [],
};

const openCashbook: CashbookSummaryResponse = {
  businessDate: TODAY_YMD,
  session: {
    id: 'cb-1',
    shopId: SHOP_ID,
    businessDate: TODAY_YMD,
    status: 'OPEN',
    openingCashPoisha: 50000,
    expectedClosingCashPoisha: 75000,
    actualClosingCashPoisha: null,
    variancePoisha: null,
    note: 'সকালের ক্যাশ',
    openedByUserId: 'owner-1',
    openedByName: 'রহিম মালিক',
    closedByUserId: null,
    closedByName: null,
    openedAt: '2026-11-12T02:00:00.000Z',
    closedAt: null,
    version: 1,
    createdAt: '2026-11-12T02:00:00.000Z',
    updatedAt: '2026-11-12T02:00:00.000Z',
  },
  totals: {
    cashInPoisha: 30000,
    cashOutPoisha: 5000,
    netCashPoisha: 25000,
    bkashInPoisha: 8000,
    bkashOutPoisha: 0,
    netBkashPoisha: 8000,
    nagadInPoisha: 0,
    nagadOutPoisha: 0,
    netNagadPoisha: 0,
    otherInPoisha: 0,
    otherOutPoisha: 0,
    netOtherPoisha: 0,
    totalInPoisha: 38000,
    totalOutPoisha: 5000,
    netAllMethodsPoisha: 33000,
  },
  liveExpectedClosingCashPoisha: 75000,
  previousClosedCashPoisha: 50000,
  entries: [
    {
      id: 'entry-1',
      shopId: SHOP_ID,
      sessionId: 'cb-1',
      direction: 'IN',
      entryType: 'SALE_IN',
      method: 'CASH',
      amountPoisha: 30000,
      referenceType: 'SALE',
      referenceId: 's1',
      referenceNumber: 'INV-001',
      note: 'জামাল উদ্দিন',
      actorUserId: 'owner-1',
      actorName: 'রহিম মালিক',
      occurredAt: '2026-11-12T04:00:00.000Z',
      createdAt: '2026-11-12T04:00:00.000Z',
    },
  ],
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
  return await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('Phase 7 Cashbook, Live Dashboard & Financial Reports Mobile UI', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    const adapter = await openPlatformSqliteDatabase();
    resetLocalDatabaseInstanceForTests(adapter);
    usePreferencesStore.setState({ language: 'bn', digitStyle: 'bn' });
    useAuthStore.setState({
      status: 'authenticated',
      user: sampleOwner,
      shop: sampleShop,
      hasOfflinePin: true,
      isOfflineSession: false,
    });
  });

  afterEach(async () => {
    await cleanup();
    for (const c of createdClients) {
      c.unmount();
      c.clear();
    }
    createdClients.length = 0;
  });

  it('maintains 100% i18n key parity for home, reports, and cashbook namespaces', () => {
    expect(Object.keys(bnTranslations.reports).sort()).toEqual(
      Object.keys(enTranslations.reports).sort(),
    );
    expect(Object.keys(bnTranslations.cashbook).sort()).toEqual(
      Object.keys(enTranslations.cashbook).sort(),
    );
    expect(Object.keys(bnTranslations.cashbook.entryTypes).sort()).toEqual(
      Object.keys(enTranslations.cashbook.entryTypes).sort(),
    );
    expect(Object.keys(bnTranslations.home).sort()).toEqual(Object.keys(enTranslations.home).sort());
  });

  it('persists and clears Cashbook & Report offline snapshots cleanly in SQLite v6', async () => {
    await saveLocalCashbookSummary(SHOP_ID, TODAY_YMD, openCashbook);
    await saveLocalReportSnapshot(SHOP_ID, 'dashboard:OWNER', sampleOwnerDashboard);

    const loadedCb = await loadLocalCashbookSummary(SHOP_ID, TODAY_YMD);
    const loadedDash = await loadLocalReportSnapshot<DashboardSummaryResponse>(
      SHOP_ID,
      'dashboard:OWNER',
    );
    expect(loadedCb?.liveExpectedClosingCashPoisha).toBe(75000);
    expect(loadedDash?.todayNetProfitPoisha).toBe(12000);

    await clearLocalCashbookReportsData();
    expect(await loadLocalCashbookSummary(SHOP_ID, TODAY_YMD)).toBeNull();
    expect(await loadLocalReportSnapshot(SHOP_ID, 'dashboard:OWNER')).toBeNull();
  });

  it('renders live Home Dashboard KPIs for OWNER, masks profit for EMPLOYEE, and supports offline fallback', async () => {
    const dashSpy = jest
      .spyOn(reportsApi, 'getDashboard')
      .mockResolvedValue({ dashboard: sampleOwnerDashboard });

    await renderWithQuery(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByText('৳ ৪০০')).toBeTruthy(); // todayNetSalesPoisha
      expect(screen.getByText('৳ ১৬০')).toBeTruthy(); // todayGrossProfitPoisha
      expect(screen.getByText('৳ ১২০')).toBeTruthy(); // todayNetProfitPoisha
      expect(screen.getByText('৳ ১,২৫০')).toBeTruthy(); // customerDueTotalPoisha
      expect(screen.getByText('INV-001')).toBeTruthy();
    });

    // Offline fallback uses SQLite cached snapshot
    dashSpy.mockRejectedValue(
      new ApiClientError({
        statusCode: 0,
        code: 'NETWORK_ERROR',
        message: 'Offline',
      }),
    );
    await cleanup();
    await renderWithQuery(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByText('অফলাইন ক্যাশ থেকে দেখানো হচ্ছে')).toBeTruthy();
      expect(screen.getByText('৳ ৪০০')).toBeTruthy();
    });

    // Employee sees masked profit fields
    await cleanup();
    useAuthStore.setState({ user: sampleEmployee });
    dashSpy.mockResolvedValue({
      dashboard: {
        ...sampleOwnerDashboard,
        todayCogsPoisha: null,
        todayGrossProfitPoisha: null,
        todayWastageLossPoisha: null,
        todayNetProfitPoisha: null,
      },
    });
    await renderWithQuery(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByText('৳ ৪০০')).toBeTruthy();
    });
    expect(screen.queryByText('মোট লাভ')).toBeNull();
    expect(screen.queryByText('নিট লাভ')).toBeNull();
    expect(screen.queryByText('মহাজনের বাকি দেনা')).toBeNull();
  });

  it('switches Reports tabs across Sales, P&L (Owner-only), Products & Dues/Valuation', async () => {
    jest.spyOn(reportsApi, 'getSalesReport').mockResolvedValue({ report: sampleSalesReport });
    jest.spyOn(reportsApi, 'getProfitLossReport').mockResolvedValue({ report: samplePnlReport });
    jest.spyOn(reportsApi, 'getProductsReport').mockResolvedValue({ report: sampleProductsReport });
    jest.spyOn(reportsApi, 'getDuesReport').mockResolvedValue({ report: sampleDuesReport });
    jest.spyOn(catalogApi, 'getValuation').mockResolvedValue({ valuation: sampleValuation });

    await renderWithQuery(<ReportsScreen />);

    await waitFor(() => {
      expect(screen.getAllByText('৳ ৪০০').length).toBeGreaterThan(0);
      expect(screen.getByText('৳ ২৫০')).toBeTruthy(); // Cash breakdown
    });

    // Switch to P&L tab (Owner)
    await fireEvent.press(screen.getByText('লাভ-ক্ষতি'));
    await waitFor(() => {
      expect(screen.getByText('লাভ-ক্ষতির পূর্ণ হিসাব (P&L)')).toBeTruthy();
      expect(screen.getByText('৳ ১২০')).toBeTruthy(); // Net Profit
      expect(screen.getByText('৳ ৫০০')).toBeTruthy(); // Purchases informational
    });

    // Switch to Products tab
    await fireEvent.press(screen.getByText('পণ্য'));
    await waitFor(() => {
      expect(screen.getByText('বাংলা মিষ্টি পান')).toBeTruthy();
      expect(screen.getAllByText('৳ ৪১০').length).toBeGreaterThan(0);
    });

    // Switch to Dues & Valuation tab
    await fireEvent.press(screen.getByText('বাকি ও মজুত'));
    await waitFor(() => {
      expect(screen.getByText('৳ ৪,৫০০')).toBeTruthy(); // Total stock valuation
      expect(screen.getByText('মো: জামাল উদ্দিন')).toBeTruthy();
      expect(screen.getByText('যশোর পান আড়ত')).toBeTruthy();
    });

    // Verify Employee sees locked notice on P&L tab
    await cleanup();
    useAuthStore.setState({ user: sampleEmployee });
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(screen.getByText('লাভ-ক্ষতি'));
    await waitFor(() => {
      expect(screen.getByText('লাভ-ক্ষতি রিপোর্ট সংরক্ষিত')).toBeTruthy();
    });
  });

  it('opens Cashbook with yesterday closing suggestion, creates manual entry & closes with variance', async () => {
    const getSummarySpy = jest
      .spyOn(cashbookApi, 'getSummary')
      .mockResolvedValue(unopenedCashbook);
    const openSpy = jest.spyOn(cashbookApi, 'open').mockResolvedValue(openCashbook);
    const closedCashbook: CashbookSummaryResponse = {
      ...openCashbook,
      session: {
        id: 'cb-1',
        shopId: SHOP_ID,
        businessDate: TODAY_YMD,
        status: 'CLOSED',
        openingCashPoisha: 50000,
        expectedClosingCashPoisha: 75000,
        actualClosingCashPoisha: 74000,
        variancePoisha: -1000,
        note: 'দোকান বন্ধের ক্যাশ হিসাব',
        openedByUserId: 'owner-1',
        openedByName: 'রহিম মালিক',
        closedByUserId: 'owner-1',
        closedByName: 'রহিম মালিক',
        openedAt: '2026-11-12T02:00:00.000Z',
        closedAt: '2026-11-12T15:00:00.000Z',
        version: 2,
        createdAt: '2026-11-12T02:00:00.000Z',
        updatedAt: '2026-11-12T15:00:00.000Z',
      },
    };
    const closeSpy = jest.spyOn(cashbookApi, 'close').mockResolvedValue(closedCashbook);

    await renderWithQuery(<CashbookScreen />);

    await waitFor(() => {
      expect(screen.getByText('দিনের শুরুতে ক্যাশবক্স খুলুন')).toBeTruthy();
      expect(screen.getByText('আগের সমাপনী টাকা বসান')).toBeTruthy();
    });

    await fireEvent.press(screen.getByText('আগের সমাপনী টাকা বসান'));
    getSummarySpy.mockResolvedValue(openCashbook);
    await fireEvent.press(screen.getByText('ক্যাশবুক খুলুন'));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDate: TODAY_YMD,
          openingCashPoisha: 50000,
        }),
      );
      expect(screen.getByText('৳ ৭৫০')).toBeTruthy(); // expected cash
      expect(screen.getByText(/INV-001 • জামাল উদ্দিন/)).toBeTruthy();
    });

    // Open close register modal, enter counted cash 740 BDT (-10 BDT short)
    await fireEvent.press(screen.getByText('দিন শেষে ক্যাশ হিসাব বন্ধ করুন'));
    const actualInput = await screen.findByLabelText('হাতে গোনা প্রকৃত নগদ টাকা (৳) *');
    await fireEvent.changeText(actualInput, '৭৪০');
    getSummarySpy.mockResolvedValue(closedCashbook);
    await fireEvent.press(screen.getByText('ক্যাশবুক বন্ধ করুন'));

    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDate: TODAY_YMD,
          actualClosingCashPoisha: 74000,
        }),
      );
      expect(screen.getByText('বন্ধ করা হয়েছে')).toBeTruthy();
    });
  });
});
