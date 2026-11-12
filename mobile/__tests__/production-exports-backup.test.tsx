import type { AuthUserDto, SaleDto, ShopBackupDocument, ShopProfileDto } from '@dokanwala/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import React from 'react';
import ReportsScreen from '@/app/(tabs)/reports';
import BackupScreen from '@/app/backup/index';
import ReceiptScreen from '@/app/sales/receipt';
import { resetLocalDatabaseInstanceForTests } from '@/database/sqlite';
import { openPlatformSqliteDatabase } from '@/database/sqlite-driver.web';
import bnTranslations from '@/i18n/bn.json';
import enTranslations from '@/i18n/en.json';
import { backupApi } from '@/services/api/backup';
import { catalogApi } from '@/services/api/catalog';
import { assertProductionHttpsUrl } from '@/services/api/client';
import { reportsApi } from '@/services/api/reports';
import { salesApi } from '@/services/api/sales';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';
import * as fileExportUtils from '@/utils/file-export';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({ saleId: '11111111-1111-4111-8111-111111111111' }),
}));

function collectLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectLeafKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

const OWNER_USER: AuthUserDto = {
  id: 'owner-1',
  shopId: 'shop-1',
  name: 'হাজী রহিম',
  phone: '01711223344',
  role: 'OWNER',
  hasPin: false,
  preferredLanguage: 'bn',
  preferredDigitStyle: 'bn',
  isActive: true,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const EMPLOYEE_USER: AuthUserDto = {
  ...OWNER_USER,
  id: 'emp-1',
  name: 'করিম কর্মচারী',
  role: 'EMPLOYEE',
};

const MOCK_SHOP: ShopProfileDto = {
  id: 'shop-1',
  nameBn: 'রহিম পান ও মুদি স্টোর',
  nameEn: 'Rahim Pan & Grocery',
  addressBn: 'ঢাকা',
  addressEn: 'Dhaka',
  phone: '01711223344',
  logoUrl: null,
  currencyCode: 'BDT',
  timezone: 'Asia/Dhaka',
  defaultLanguage: 'bn',
  defaultDigitStyle: 'bn',
  receiptHeaderBn: null,
  receiptFooterBn: 'ধন্যবাদ',
  allowNegativeStock: false,
  employeeCanGiveCredit: true,
  employeeMaxDiscountPercent: 10,
  isActive: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const MOCK_SALE: SaleDto = {
  id: '11111111-1111-4111-8111-111111111111',
  shopId: 'shop-1',
  receiptNumber: 'INV-20261113-0001',
  customerId: null,
  customerNameSnapshot: null,
  status: 'COMPLETED',
  subtotalPoisha: 4000,
  discountType: 'FIXED_POISHA',
  discountValue: '0.00',
  discountPoisha: 0,
  totalPoisha: 4000,
  paidPoisha: 4000,
  settledDuePoisha: 0,
  duePoisha: 0,
  tenderedPoisha: 5000,
  changePoisha: 1000,
  returnedTotalPoisha: 0,
  cashRefundedPoisha: 0,
  cogsPoisha: 2500,
  estimatedProfitPoisha: 1500,
  note: null,
  actorUserId: 'owner-1',
  actorName: 'হাজী রহিম',
  cancelledAt: null,
  cancelReason: null,
  soldAt: '2026-11-13T06:00:00.000Z',
  createdAt: '2026-11-13T06:00:00.000Z',
  updatedAt: '2026-11-13T06:00:00.000Z',
  items: [
    {
      id: 'item-1',
      saleId: '11111111-1111-4111-8111-111111111111',
      productId: 'prod-1',
      unitId: 'unit-1',
      productNameBn: 'দেশি মিষ্টি পান',
      productNameEn: 'Deshi Pan',
      unitNameBn: 'বিড়া',
      unitNameEn: 'Bira',
      qtyDisplay: '1.0000',
      conversionFactorToBase: '20.0000',
      qtyBase: '20.0000',
      returnedQtyBase: '0.0000',
      unitSellingPricePoisha: 4000,
      unitCostAtSaleBdt: '1.250000',
      lineSubtotalPoisha: 4000,
      lineCogsPoisha: 2500,
    },
  ],
  payments: [
    {
      id: 'pay-1',
      saleId: '11111111-1111-4111-8111-111111111111',
      method: 'CASH',
      amountPoisha: 4000,
      reference: null,
      receivedAt: '2026-11-13T06:00:00.000Z',
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
  return await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('Phase 9 Production Exports, Receipt PDF/Print, Backup UI & HTTPS Security', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    const adapter = await openPlatformSqliteDatabase();
    resetLocalDatabaseInstanceForTests(adapter);
    usePreferencesStore.setState({ language: 'bn', digitStyle: 'bn' });
    useAuthStore.setState({
      status: 'authenticated',
      user: OWNER_USER,
      shop: MOCK_SHOP,
    });
  });

  afterEach(async () => {
    await cleanup();
    for (const client of createdClients) {
      client.unmount();
      client.clear();
    }
    createdClients.length = 0;
  });

  it('keeps 100% i18n key parity between bn.json and en.json', () => {
    const bnKeys = collectLeafKeys(bnTranslations as unknown as Record<string, unknown>);
    const enKeys = collectLeafKeys(enTranslations as unknown as Record<string, unknown>);
    expect(bnKeys).toEqual(enKeys);
  });

  it('enforces strict HTTPS API URLs in non-dev production builds', () => {
    expect(() => assertProductionHttpsUrl('http://api.dokanwala.com/api/v1', false)).toThrow(
      /https:\/\//i,
    );
    expect(() => assertProductionHttpsUrl('http://192.168.1.50:4000/api/v1', false)).toThrow(
      /https:\/\//i,
    );
    expect(assertProductionHttpsUrl('https://api.dokanwala.com/api/v1', false)).toBe(
      'https://api.dokanwala.com/api/v1',
    );
    expect(assertProductionHttpsUrl('http://192.168.1.50:4000/api/v1', true)).toBe(
      'http://192.168.1.50:4000/api/v1',
    );
  });

  it('exports reports to CSV and Bangla PDF from ReportsScreen and restricts P&L from employees', async () => {
    jest.spyOn(reportsApi, 'getSalesReport').mockResolvedValue({
      report: {
        period: 'daily',
        fromDate: '2026-11-01',
        toDate: '2026-11-13',
        totals: {
          salesCount: 1,
          grossSalesPoisha: 4000,
          discountsPoisha: 0,
          returnsPoisha: 0,
          netSalesPoisha: 4000,
          cashAndMfsReceivedPoisha: 4000,
          creditIssuedPoisha: 0,
          dueCollectedPoisha: 0,
          cogsPoisha: 2500,
          grossProfitPoisha: 1500,
        },
        paymentBreakdown: { cashPoisha: 4000, bkashPoisha: 0, nagadPoisha: 0, otherPoisha: 0 },
        buckets: [],
      },
    });
    jest.spyOn(reportsApi, 'getProfitLossReport').mockRejectedValue(new Error('forbidden'));
    jest.spyOn(reportsApi, 'getProductsReport').mockResolvedValue({
      report: {
        fromDate: '2026-11-01',
        toDate: '2026-11-13',
        totalGrossItemRevenuePoisha: 0,
        totalReturnedItemRevenuePoisha: 0,
        totalNetItemRevenuePoisha: 0,
        totalInvoiceDiscountsNetPoisha: 0,
        totalNetSalesPoisha: 0,
        totalNetCogsPoisha: null,
        totalGrossProfitPoisha: null,
        items: [],
      },
    });
    jest.spyOn(reportsApi, 'getDuesReport').mockResolvedValue({
      report: {
        totalCustomerDuePoisha: 0,
        customersWithDueCount: 0,
        customers: [],
        totalSupplierPayablePoisha: 0,
        suppliersWithPayableCount: 0,
        suppliers: [],
      },
    });
    jest.spyOn(catalogApi, 'getValuation').mockResolvedValue({
      valuation: {
        totalActiveProducts: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        totalValuationPoisha: 0,
        items: [],
      },
    });

    const downloadSpy = jest.spyOn(reportsApi, 'downloadExport').mockResolvedValue({
      bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x41]),
      filename: 'dokanwala-sales-2026-11-13.csv',
      mimeType: 'text/csv; charset=utf-8',
    });
    const shareSpy = jest
      .spyOn(fileExportUtils, 'saveAndShareBytes')
      .mockResolvedValue('file:///mock-cache/dokanwala-sales-2026-11-13.csv');

    await renderWithQuery(<ReportsScreen />);

    const csvBtn = await screen.findByTestId('reports-export-csv-btn');
    await fireEvent.press(csvBtn);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({ report: 'sales', format: 'csv', lang: 'bn' }),
      );
      expect(shareSpy).toHaveBeenCalled();
      expect(screen.getByTestId('reports-export-feedback')).toBeTruthy();
    });

    await cleanup();

    // Employee view hides export controls on P&L tab
    useAuthStore.setState({ user: EMPLOYEE_USER });
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(screen.getByText('লাভ-ক্ষতি'));
    await waitFor(() => {
      expect(screen.queryByTestId('reports-export-csv-btn')).toBeNull();
    });
  });

  it('downloads PDF receipt and invokes Print from ReceiptScreen', async () => {
    jest.spyOn(salesApi, 'get').mockResolvedValue({ sale: MOCK_SALE });
    const pdfSpy = jest.spyOn(salesApi, 'downloadReceiptPdf').mockResolvedValue({
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
      filename: 'receipt-INV-20261113-0001.pdf',
    });
    const saveShareSpy = jest
      .spyOn(fileExportUtils, 'saveAndShareBytes')
      .mockResolvedValue('file:///mock-cache/receipt.pdf');
    const printSpy = jest.spyOn(Print, 'printAsync').mockResolvedValue(undefined);

    await renderWithQuery(<ReceiptScreen />);

    const pdfBtn = await screen.findByTestId('receipt-pdf-btn');
    await fireEvent.press(pdfBtn);

    await waitFor(() => {
      expect(pdfSpy).toHaveBeenCalledWith(MOCK_SALE.id, 'bn');
      expect(saveShareSpy).toHaveBeenCalled();
      expect(screen.getByTestId('receipt-feedback-banner')).toBeTruthy();
    });

    const printBtn = screen.getByTestId('receipt-print-btn');
    await fireEvent.press(printBtn);

    await waitFor(() => {
      expect(printSpy).toHaveBeenCalled();
    });
  });

  it('restricts BackupScreen to OWNER and runs export & validated restore flow', async () => {
    // 1. Employee blocked
    useAuthStore.setState({ user: EMPLOYEE_USER });
    await renderWithQuery(<BackupScreen />);
    expect(screen.queryByTestId('backup-export-btn')).toBeNull();
    await cleanup();

    // 2. Owner export & restore flow
    useAuthStore.setState({ user: OWNER_USER });
    const mockBackupDoc: ShopBackupDocument = {
      schemaVersion: 1,
      exportedAt: '2026-11-13T06:00:00.000Z',
      sourceShopId: '11111111-1111-4111-8111-111111111111',
      checksumSha256: 'a'.repeat(64),
      data: {
        shop: {
          nameBn: 'রহিম স্টোর',
          nameEn: null,
          addressBn: null,
          addressEn: null,
          phone: null,
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
        },
        categories: [],
        units: [],
        products: [],
        productUnits: [],
        inventoryBalances: [],
        stockMovements: [],
        stockAdjustments: [],
        customers: [],
        suppliers: [],
        sales: [],
        saleItems: [],
        payments: [],
        saleReturns: [],
        saleReturnItems: [],
        purchases: [],
        purchaseItems: [],
        purchaseReturns: [],
        purchaseReturnItems: [],
        customerPayments: [],
        supplierPayments: [],
        expenseCategories: [],
        expenses: [],
        expenseAuditLogs: [],
        cashbookSessions: [],
        cashbookEntries: [],
      },
    };

    const exportSpy = jest.spyOn(backupApi, 'exportBackup').mockResolvedValue({
      document: mockBackupDoc,
      rawJson: JSON.stringify(mockBackupDoc),
      filename: 'dokanwala-backup-2026-11-13.json',
    });
    const shareSpy = jest
      .spyOn(fileExportUtils, 'saveAndShareBytes')
      .mockResolvedValue('file:///mock-cache/backup.json');
    const restoreSpy = jest.spyOn(backupApi, 'restoreBackup').mockResolvedValue({
      restore: {
        restoredAt: '2026-11-13T06:05:00.000Z',
        targetShopId: 'shop-1',
        sourceShopId: mockBackupDoc.sourceShopId,
        counts: {
          categories: 2,
          units: 4,
          products: 12,
          customers: 5,
          suppliers: 2,
          sales: 18,
          purchases: 3,
          expenses: 4,
          cashbookSessions: 1,
          cashbookEntries: 10,
        },
      },
    });

    await renderWithQuery(<BackupScreen />);

    // Export
    await fireEvent.press(screen.getByTestId('backup-export-btn'));
    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalled();
      expect(screen.getByTestId('backup-status-banner')).toBeTruthy();
    });

    // Invalid JSON shows error
    await fireEvent.changeText(screen.getByTestId('backup-json-input'), '{broken-json');
    await fireEvent.press(screen.getByTestId('backup-restore-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('backup-error-banner')).toBeTruthy();
    });

    // Valid JSON prepares confirmation, then confirms restore
    await fireEvent.changeText(
      screen.getByTestId('backup-json-input'),
      JSON.stringify(mockBackupDoc),
    );
    await fireEvent.press(screen.getByTestId('backup-restore-btn'));

    const confirmBtn = await screen.findByTestId('backup-confirm-restore-btn');
    await fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith(mockBackupDoc);
      expect(screen.getByTestId('backup-status-banner')).toBeTruthy();
    });
  });
});
