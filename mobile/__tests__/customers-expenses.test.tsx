import {
  getDhakaYmd,
  type AuthUserDto,
  type CustomerDto,
  type CustomerLedgerEntryDto,
  type ExpenseAuditLogDto,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ShopProfileDto,
} from '@dokanwala/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import CustomersDirectoryScreen from '@/app/customers';
import CustomerDetailScreen from '@/app/customers/[id]';
import ExpensesDirectoryScreen from '@/app/expenses';
import ExpenseDetailScreen from '@/app/expenses/[id]';
import ExpenseFormScreen from '@/app/expenses/form';
import {
  clearLocalCustomersExpensesData,
  loadLocalCustomerLedger,
  loadLocalExpenseById,
  loadLocalExpenseCategories,
  loadLocalExpenseHistory,
  loadLocalExpenses,
  replaceLocalExpenses,
  saveLocalCustomerLedger,
  saveLocalExpenseCategories,
  saveLocalExpenseHistory,
} from '@/database/repositories/customers-expenses-local.repo';
import {
  clearLocalSalesData,
  loadLocalCustomers,
  saveLocalCustomers,
} from '@/database/repositories/sales-local.repo';
import { resetLocalDatabaseInstanceForTests } from '@/database/sqlite';
import { openPlatformSqliteDatabase } from '@/database/sqlite-driver.web';
import bnTranslations from '@/i18n/bn.json';
import enTranslations from '@/i18n/en.json';
import { ApiClientError } from '@/services/api/client';
import { expenseCategoriesApi, expensesApi } from '@/services/api/expenses';
import { customersApi } from '@/services/api/sales';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

const SHOP_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_JAMAL_ID = 'aaaa1111-1111-4111-8111-111111111111';
const CUSTOMER_KAMAL_ID = 'aaaa2222-2222-4222-8222-222222222222';
const SALE_1_ID = 'bbbb1111-1111-4111-8111-111111111111';
const EXP_CAT_ELECTRIC_ID = 'cccc1111-1111-4111-8111-111111111111';
const EXP_CAT_TEA_ID = 'cccc2222-2222-4222-8222-222222222222';
const EXPENSE_1_ID = 'dddd1111-1111-4111-8111-111111111111';

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

const jamalCustomer: CustomerDto = {
  id: CUSTOMER_JAMAL_ID,
  shopId: SHOP_ID,
  nameBn: 'মো: জামাল উদ্দিন',
  nameEn: 'Md. Jamal Uddin',
  phone: '+8801711000011',
  address: 'নবাবপুর রোড, ঢাকা',
  note: 'নিয়মিত ক্রেতা',
  totalPurchasedPoisha: 50000,
  totalPaidPoisha: 20000,
  duePoisha: 30000,
  isActive: true,
  version: 1,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const kamalCustomer: CustomerDto = {
  id: CUSTOMER_KAMAL_ID,
  shopId: SHOP_ID,
  nameBn: 'কামাল হোসেন',
  nameEn: 'Kamal Hossain',
  phone: '+8801811000022',
  address: null,
  note: null,
  totalPurchasedPoisha: 15000,
  totalPaidPoisha: 15000,
  duePoisha: 0,
  isActive: true,
  version: 1,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const jamalLedger: CustomerLedgerEntryDto[] = [
  {
    id: `sale:${SALE_1_ID}`,
    type: 'SALE',
    referenceId: SALE_1_ID,
    referenceNumber: 'INV-20261112-0001',
    occurredAt: '2026-11-12T08:00:00.000Z',
    totalPoisha: 50000,
    paidOrRefundedPoisha: 20000,
    dueDeltaPoisha: 30000,
    runningDuePoisha: 30000,
    method: 'CASH',
    note: 'সকালের পান-সুপারি বিল',
  },
];

const electricCategory: ExpenseCategoryDto = {
  id: EXP_CAT_ELECTRIC_ID,
  shopId: SHOP_ID,
  nameBn: 'বিদ্যুৎ বিল',
  nameEn: 'Electricity Bill',
  isDefault: true,
  sortOrder: 1,
  isActive: true,
  version: 1,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const teaCategory: ExpenseCategoryDto = {
  id: EXP_CAT_TEA_ID,
  shopId: SHOP_ID,
  nameBn: 'আপ্যায়ন ও চা',
  nameEn: 'Tea & Snacks',
  isDefault: false,
  sortOrder: 8,
  isActive: true,
  version: 1,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const todayYmd = getDhakaYmd();

const sampleExpense: ExpenseDto = {
  id: EXPENSE_1_ID,
  shopId: SHOP_ID,
  categoryId: EXP_CAT_ELECTRIC_ID,
  categoryNameBn: 'বিদ্যুৎ বিল',
  categoryNameEn: 'Electricity Bill',
  amountPoisha: 25000,
  method: 'BKASH',
  reference: 'DESCO-77',
  note: 'নভেম্বর বিদ্যুৎ বিল',
  incurredAt: `${todayYmd}T10:00:00.000Z`,
  actorUserId: sampleOwner.id,
  actorName: sampleOwner.name,
  version: 2,
  createdAt: `${todayYmd}T09:00:00.000Z`,
  updatedAt: `${todayYmd}T10:00:00.000Z`,
};

const sampleAuditLogs: ExpenseAuditLogDto[] = [
  {
    id: 'audit-2',
    shopId: SHOP_ID,
    expenseId: EXPENSE_1_ID,
    action: 'UPDATED',
    editedById: sampleOwner.id,
    editedByName: sampleOwner.name,
    beforeJson: {
      categoryId: EXP_CAT_ELECTRIC_ID,
      categoryNameBn: 'বিদ্যুৎ বিল',
      amountPoisha: 20000,
      method: 'CASH',
      reference: 'DESCO-77',
      note: 'নভেম্বর বিল',
      incurredAt: `${todayYmd}T10:00:00.000Z`,
    },
    afterJson: {
      categoryId: EXP_CAT_ELECTRIC_ID,
      categoryNameBn: 'বিদ্যুৎ বিল',
      amountPoisha: 25000,
      method: 'BKASH',
      reference: 'DESCO-77',
      note: 'নভেম্বর বিদ্যুৎ বিল',
      incurredAt: `${todayYmd}T10:00:00.000Z`,
    },
    reason: 'রসিদ অনুযায়ী সংশোধন',
    occurredAt: `${todayYmd}T10:00:00.000Z`,
  },
  {
    id: 'audit-1',
    shopId: SHOP_ID,
    expenseId: EXPENSE_1_ID,
    action: 'CREATED',
    editedById: sampleOwner.id,
    editedByName: sampleOwner.name,
    beforeJson: null,
    afterJson: {
      categoryId: EXP_CAT_ELECTRIC_ID,
      categoryNameBn: 'বিদ্যুৎ বিল',
      amountPoisha: 20000,
      method: 'CASH',
      reference: 'DESCO-77',
      note: 'নভেম্বর বিল',
      incurredAt: `${todayYmd}T10:00:00.000Z`,
    },
    reason: null,
    occurredAt: `${todayYmd}T09:00:00.000Z`,
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

function collectKeyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const paths: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      paths.push(...collectKeyPaths(val as Record<string, unknown>, path));
    } else {
      paths.push(path);
    }
  }
  return paths.sort();
}

describe('Phase 6 Customers, Due Ledger & Expenses UI', () => {
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

  it('maintains 100% i18n key parity between bn.json and en.json', () => {
    const bnKeys = collectKeyPaths(bnTranslations as Record<string, unknown>);
    const enKeys = collectKeyPaths(enTranslations as Record<string, unknown>);
    expect(bnKeys).toEqual(enKeys);
  });

  it('persists and queries customer ledgers, expense categories, expenses, and audit logs in SQLite', async () => {
    await saveLocalCustomers([jamalCustomer, kamalCustomer]);
    await saveLocalCustomerLedger(jamalCustomer, jamalLedger);
    await saveLocalExpenseCategories([electricCategory, teaCategory]);
    await replaceLocalExpenses([sampleExpense]);
    await saveLocalExpenseHistory(sampleExpense, sampleAuditLogs);

    const cachedLedger = await loadLocalCustomerLedger(CUSTOMER_JAMAL_ID);
    expect(cachedLedger?.customer.duePoisha).toBe(30000);
    expect(cachedLedger?.entries).toHaveLength(1);
    expect(cachedLedger?.entries[0]?.runningDuePoisha).toBe(30000);

    const cachedCategories = await loadLocalExpenseCategories(SHOP_ID);
    expect(cachedCategories.map((c) => c.nameBn)).toEqual(['বিদ্যুৎ বিল', 'আপ্যায়ন ও চা']);

    const filteredExpenses = await loadLocalExpenses(SHOP_ID, {
      categoryId: EXP_CAT_ELECTRIC_ID,
      from: todayYmd,
      to: todayYmd,
      q: 'বিদ্যুৎ',
    });
    expect(filteredExpenses.expenses).toHaveLength(1);
    expect(filteredExpenses.totalExpensePoisha).toBe(25000);

    const cachedExpense = await loadLocalExpenseById(EXPENSE_1_ID);
    expect(cachedExpense?.reference).toBe('DESCO-77');

    const cachedHistory = await loadLocalExpenseHistory(EXPENSE_1_ID);
    expect(cachedHistory?.history).toHaveLength(2);
    expect(cachedHistory?.history[0]?.action).toBe('UPDATED');

    await clearLocalCustomersExpensesData();
    expect((await loadLocalCustomerLedger(CUSTOMER_JAMAL_ID))?.entries).toHaveLength(0);
    expect(await loadLocalExpenseCategories(SHOP_ID)).toHaveLength(0);
    expect((await loadLocalExpenses(SHOP_ID)).expenses).toHaveLength(0);

    await clearLocalSalesData();
    expect(await loadLocalCustomers(SHOP_ID)).toHaveLength(0);
  });

  it('renders Customers Directory, filters due customers, displays Ledger, and collects Bangla due payment', async () => {
    const listSpy = jest.spyOn(customersApi, 'list').mockImplementation(async (params) => {
      if (params?.withDuesOnly) {
        return { customers: [jamalCustomer] };
      }
      return { customers: [jamalCustomer, kamalCustomer] };
    });

    await renderWithQuery(<CustomersDirectoryScreen />);

    await waitFor(() => {
      expect(screen.getByText('মো: জামাল উদ্দিন')).toBeTruthy();
      expect(screen.getByText('কামাল হোসেন')).toBeTruthy();
      expect(screen.getByText('২ জন ক্রেতা')).toBeTruthy();
    });

    await fireEvent.press(screen.getByText('শুধু বাকি'));

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ withDuesOnly: true }));
      expect(screen.getByText('১ জন ক্রেতা')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId(`customer-card-${CUSTOMER_JAMAL_ID}`));
    expect(mockPush).toHaveBeenCalledWith(`/customers/${CUSTOMER_JAMAL_ID}`);

    await cleanup();
    mockSearchParams = { id: CUSTOMER_JAMAL_ID };
    jest.spyOn(customersApi, 'getLedger').mockResolvedValue({
      customer: jamalCustomer,
      entries: jamalLedger,
    });
    const collectSpy = jest.spyOn(customersApi, 'collectPayment').mockResolvedValue({
      customer: { ...jamalCustomer, totalPaidPoisha: 30000, duePoisha: 20000 },
      payment: {
        id: 'cpay-1',
        shopId: SHOP_ID,
        customerId: CUSTOMER_JAMAL_ID,
        saleId: SALE_1_ID,
        method: 'BKASH',
        amountPoisha: 10000,
        reference: 'TRX999',
        note: 'দোকানে বাকি জমা',
        actorUserId: sampleOwner.id,
        actorName: sampleOwner.name,
        paidAt: `${todayYmd}T12:00:00.000Z`,
        createdAt: `${todayYmd}T12:00:00.000Z`,
      },
      idempotencyReplayed: false,
    });

    await renderWithQuery(<CustomerDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('customer-collect-due-btn')).toBeTruthy();
      expect(screen.getByText(/INV-২০২৬১১১২-০০০১/)).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('customer-collect-due-btn'));
    await fireEvent.changeText(screen.getByLabelText('আদায়ের পরিমাণ (৳) *'), '১০০');
    await fireEvent.press(screen.getByRole('button', { name: 'বিকাশ' }));
    await fireEvent.changeText(screen.getByLabelText('রেফারেন্স / ট্রানজেকশন নং (ঐচ্ছিক)'), 'TRX999');
    await fireEvent.press(screen.getByTestId('customer-payment-submit-btn'));

    await waitFor(() => {
      expect(collectSpy).toHaveBeenCalledWith(
        CUSTOMER_JAMAL_ID,
        {
          method: 'BKASH',
          amountPoisha: 10000,
          reference: 'TRX999',
        },
        expect.any(String),
      );
    });
  });

  it('blocks EMPLOYEE from collecting customer due when shop.employeeCanGiveCredit is false', async () => {
    useAuthStore.setState({
      user: sampleEmployee,
      shop: { ...sampleShop, employeeCanGiveCredit: false },
    });
    mockSearchParams = { id: CUSTOMER_JAMAL_ID };
    jest.spyOn(customersApi, 'getLedger').mockResolvedValue({
      customer: jamalCustomer,
      entries: jamalLedger,
    });

    await renderWithQuery(<CustomerDetailScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('দোকানের নিয়ম অনুযায়ী কর্মচারী বাকি লেনদেন পরিচালনা করতে পারবেন না।'),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId('customer-collect-due-btn')).toBeNull();
  });

  it('falls back to SQLite offline on Expenses Directory and creates Expense in Bangla numerals', async () => {
    await saveLocalExpenseCategories([electricCategory, teaCategory]);
    await replaceLocalExpenses([sampleExpense]);

    jest
      .spyOn(expenseCategoriesApi, 'list')
      .mockRejectedValue(
        new ApiClientError({ code: 'NETWORK_ERROR', message: 'Offline', statusCode: 0 }),
      );
    jest
      .spyOn(expensesApi, 'list')
      .mockRejectedValue(
        new ApiClientError({ code: 'NETWORK_ERROR', message: 'Offline', statusCode: 0 }),
      );

    await renderWithQuery(<ExpensesDirectoryScreen />);

    await waitFor(() => {
      expect(screen.getByText('অফলাইন ক্যাশ থেকে দেখানো হচ্ছে')).toBeTruthy();
      expect(screen.getByText('নভেম্বর বিদ্যুৎ বিল')).toBeTruthy();
      expect(screen.getAllByText('৳ ২৫০').length).toBeGreaterThanOrEqual(2);
    });

    await cleanup();
    jest
      .spyOn(expenseCategoriesApi, 'list')
      .mockResolvedValue({ categories: [electricCategory, teaCategory] });
    const createExpenseSpy = jest.spyOn(expensesApi, 'create').mockResolvedValue({
      expense: sampleExpense,
      idempotencyReplayed: false,
    });

    await renderWithQuery(<ExpenseFormScreen />);

    await waitFor(() => {
      expect(screen.getByText('আপ্যায়ন ও চা')).toBeTruthy();
    });

    await fireEvent.press(screen.getByText('আপ্যায়ন ও চা'));
    await fireEvent.changeText(screen.getByLabelText('খরচের পরিমাণ (৳) *'), '২৫০');
    await fireEvent.press(screen.getByRole('button', { name: 'বিকাশ' }));
    await fireEvent.changeText(screen.getByLabelText('বিবরণ / নোট (ঐচ্ছিক)'), 'দুপুরের চা-নাস্তা');
    await fireEvent.press(screen.getByTestId('expense-submit-btn'));

    await waitFor(() => {
      expect(createExpenseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: EXP_CAT_TEA_ID,
          amountPoisha: 25000,
          method: 'BKASH',
          note: 'দুপুরের চা-নাস্তা',
        }),
        expect.any(String),
      );
      expect(mockReplace).toHaveBeenCalledWith(`/expenses/${EXPENSE_1_ID}`);
    });
  });

  it('shows Expense Audit History to OWNER and restricts editing & audit history for EMPLOYEE', async () => {
    mockSearchParams = { id: EXPENSE_1_ID };
    jest.spyOn(expensesApi, 'get').mockResolvedValue({ expense: sampleExpense });
    const historySpy = jest.spyOn(expensesApi, 'getHistory').mockResolvedValue({
      expense: sampleExpense,
      history: sampleAuditLogs,
    });

    await renderWithQuery(<ExpenseDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('expense-edit-btn')).toBeTruthy();
      expect(screen.getByText('খরচ পরিবর্তনের অডিট ইতিহাস (Audit Trail)')).toBeTruthy();
      expect(screen.getByText('সংশোধিত')).toBeTruthy();
      expect(screen.getByText('কারণ: রসিদ অনুযায়ী সংশোধন')).toBeTruthy();
      expect(screen.getByText('পরিমাণ: ৳ ২০০ → ৳ ২৫০')).toBeTruthy();
      expect(screen.getByText('মাধ্যম: নগদ → বিকাশ')).toBeTruthy();
    });
    expect(historySpy).toHaveBeenCalledWith(EXPENSE_1_ID);

    // Employee sees restricted view & does NOT fetch audit history
    await cleanup();
    historySpy.mockClear();
    useAuthStore.setState({ user: sampleEmployee });

    await renderWithQuery(<ExpenseDetailScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'খরচ সম্পাদনা ও পরিবর্তন অডিট ইতিহাস শুধুমাত্র দোকানের মালিক দেখতে ও পরিচালনা করতে পারবেন।',
        ),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId('expense-edit-btn')).toBeNull();
    expect(historySpy).not.toHaveBeenCalled();

    // Employee blocked from edit mode route
    await cleanup();
    mockSearchParams = { expenseId: EXPENSE_1_ID };
    await renderWithQuery(<ExpenseFormScreen />);
    expect(screen.getByText('এই কাজটি শুধুমাত্র দোকানের মালিক করতে পারবেন।')).toBeTruthy();
  });

  it('opens calendar modal to pick date, records multiple same-day items (Mango 60, Banana 120), and routes Back to Expenses', async () => {
    jest
      .spyOn(expenseCategoriesApi, 'list')
      .mockResolvedValue({ categories: [electricCategory, teaCategory] });

    const createdOne: ExpenseDto = {
      ...sampleExpense,
      id: 'exp-mango-1',
      categoryId: EXP_CAT_TEA_ID,
      categoryNameBn: teaCategory.nameBn,
      categoryNameEn: teaCategory.nameEn,
      amountPoisha: 6000,
      note: 'আম (Mango)',
      incurredAt: `${todayYmd.slice(0, 8)}05T12:00:00+06:00`,
    };
    const createdTwo: ExpenseDto = {
      ...createdOne,
      id: 'exp-banana-2',
      amountPoisha: 12000,
      note: 'কলা (Banana)',
    };

    const createSpy = jest
      .spyOn(expensesApi, 'create')
      .mockResolvedValueOnce({ expense: createdOne, idempotencyReplayed: false })
      .mockResolvedValueOnce({ expense: createdTwo, idempotencyReplayed: false });

    await renderWithQuery(<ExpenseFormScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('expense-date-picker-btn')).toBeTruthy();
    });

    // Open calendar modal and pick day 05 of the current month
    const targetYmd = `${todayYmd.slice(0, 8)}05`;
    await fireEvent.press(screen.getByTestId('expense-date-picker-btn'));
    const dayCell = await screen.findByTestId(`calendar-day-${targetYmd}`);
    await fireEvent.press(dayCell);

    // Fill first row: Mango 60 tk
    await fireEvent.changeText(screen.getByTestId('expense-amount-input-0'), '৬০');
    await fireEvent.changeText(screen.getByTestId('expense-note-input-0'), 'আম (Mango)');

    // Add second row: Banana 120 tk
    await fireEvent.press(screen.getByTestId('expense-add-item-btn'));
    await fireEvent.changeText(screen.getByTestId('expense-amount-input-1'), '১২০');
    await fireEvent.changeText(screen.getByTestId('expense-note-input-1'), 'কলা (Banana)');

    await waitFor(() => {
      expect(screen.getByText('মোট ২টি আইটেম • সর্বমোট ৳ ১৮০')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('expense-submit-btn'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('expense-batch-summary')).toBeTruthy();
      expect(screen.getByText('আম (Mango)')).toBeTruthy();
      expect(screen.getByText('কলা (Banana)')).toBeTruthy();
    });

    // Clicking Back from batch summary routes to Expenses Directory (not Home)
    await fireEvent.press(screen.getByTestId('expense-batch-back-btn'));
    expect(mockReplace).toHaveBeenCalledWith('/expenses');

    // Verify ExpenseDetailScreen Back button also navigates directly to /expenses
    await cleanup();
    mockReplace.mockClear();
    mockSearchParams = { id: EXPENSE_1_ID };
    jest.spyOn(expensesApi, 'get').mockResolvedValue({ expense: sampleExpense });
    jest.spyOn(expensesApi, 'getHistory').mockResolvedValue({
      expense: sampleExpense,
      history: sampleAuditLogs,
    });

    await renderWithQuery(<ExpenseDetailScreen />);
    const detailBackBtn = await screen.findByTestId('expense-detail-back-btn');
    await fireEvent.press(detailBackBtn);
    expect(mockReplace).toHaveBeenCalledWith('/expenses');
  });

  it('filters Expenses Directory by a specific calendar date and supports prev/next day navigation', async () => {
    jest
      .spyOn(expenseCategoriesApi, 'list')
      .mockResolvedValue({ categories: [electricCategory, teaCategory] });
    const listSpy = jest.spyOn(expensesApi, 'list').mockResolvedValue({
      expenses: [sampleExpense],
      totalExpensePoisha: sampleExpense.amountPoisha,
    });

    await renderWithQuery(<ExpensesDirectoryScreen />);

    const pickDateBtn = await screen.findByTestId('expenses-specific-date-btn');
    await fireEvent.press(pickDateBtn);

    const targetYmd = `${todayYmd.slice(0, 8)}05`;
    const dayCell = await screen.findByTestId(`calendar-day-${targetYmd}`);
    await fireEvent.press(dayCell);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ from: targetYmd, to: targetYmd }),
      );
      expect(screen.getByTestId('expenses-specific-date-bar')).toBeTruthy();
    });

    // Clicking Next Day shifts +1 day
    const nextDayYmd = `${todayYmd.slice(0, 8)}06`;
    await fireEvent.press(screen.getByTestId('expenses-specific-next-day-btn'));
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ from: nextDayYmd, to: nextDayYmd }),
      );
    });

    // Clicking Add Expense passes defaultDate query param
    await fireEvent.press(screen.getByTestId('expenses-add-new-btn'));
    expect(mockPush).toHaveBeenCalledWith(`/expenses/form?defaultDate=${nextDayYmd}`);
  });
});
