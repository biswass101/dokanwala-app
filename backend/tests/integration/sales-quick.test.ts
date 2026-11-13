import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase } from '../../src/database/prisma.js';
import { shiftDhakaYmd } from '@dokanwala/shared';
import { formatDhakaYmd } from '../../src/shared/utils/timezone.js';
import { cleanTestDatabase } from '../helpers/db-reset.js';

describe('Quick Sale / Direct Daily Sale API & Business Calculation Integration', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await disconnectDatabase();
  });

  async function registerTestShop(phone = '01711998877', shopNameBn = 'করিম স্টোর') {
    const reg = await request(app).post('/api/v1/auth/register').send({
      shopNameBn,
      ownerName: 'করিম সাহেব',
      phone,
      password: 'StrongPassword123',
      preferredLanguage: 'bn',
      preferredDigitStyle: 'bn',
    });
    expect(reg.status).toBe(201);
    const ownerToken = reg.body.data.tokens.accessToken as string;
    const shopId = reg.body.data.shop.id as string;
    return { ownerToken, shopId };
  }

  it('records quick sale with lump-sum selling price and notes, immediately impacting all business calculations', async () => {
    const { ownerToken } = await registerTestShop();

    // 1. Initial dashboard should have zero sales
    const initialDash = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(initialDash.status).toBe(200);
    expect(initialDash.body.data.dashboard.todaySalesPoisha).toBe(0);
    expect(initialDash.body.data.dashboard.todaySalesCount).toBe(0);

    // 2. Merchant enters quick sale: 15 pieces sold for ৳1,500 (150000 poisha) with note
    const quickSaleRes = await request(app)
      .post('/api/v1/sales/quick')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'quick-sale-1')
      .send({
        totalSellingPricePoisha: 150000,
        quantity: '15',
        note: 'আজকের মোট কাউন্টার বিক্রি',
        paymentMethod: 'CASH',
      });

    expect(quickSaleRes.status).toBe(201);
    const sale = quickSaleRes.body.data.sale;
    expect(sale.totalPoisha).toBe(150000);
    expect(sale.paidPoisha).toBe(150000);
    expect(sale.duePoisha).toBe(0);
    expect(sale.note).toBe('আজকের মোট কাউন্টার বিক্রি');
    expect(sale.items.length).toBe(1);
    expect(sale.items[0].lineSubtotalPoisha).toBe(150000);
    expect(sale.payments.length).toBe(1);
    expect(sale.payments[0].method).toBe('CASH');
    expect(sale.payments[0].amountPoisha).toBe(150000);

    // 3. Immediately impacts Dashboard summary KPIs, charts, and cash in hand
    const updatedDash = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(updatedDash.status).toBe(200);
    expect(updatedDash.body.data.dashboard.todaySalesPoisha).toBe(150000);
    expect(updatedDash.body.data.dashboard.todaySalesCount).toBe(1);
    expect(updatedDash.body.data.dashboard.cashbookExpectedCashPoisha).toBe(150000);
    expect(updatedDash.body.data.dashboard.recentTransactions.length).toBeGreaterThan(0);
    expect(updatedDash.body.data.dashboard.recentTransactions[0].amountPoisha).toBe(150000);

    // 4. Immediately impacts Cashbook
    const cashbookRes = await request(app)
      .get('/api/v1/cashbook')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(cashbookRes.status).toBe(200);
    expect(cashbookRes.body.data.totals.cashInPoisha).toBe(150000);
    expect(cashbookRes.body.data.liveExpectedClosingCashPoisha).toBe(150000);

    // 5. Appears in Sales list
    const salesListRes = await request(app)
      .get('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(salesListRes.status).toBe(200);
    expect(salesListRes.body.data.sales.length).toBe(1);
    expect(salesListRes.body.data.sales[0].id).toBe(sale.id);
  });

  it('records quick sale with specific/past date and reflects in date comparison calculations', async () => {
    const { ownerToken } = await registerTestShop('01811223344');
    const today = formatDhakaYmd();
    const yesterday = shiftDhakaYmd(today, -1);

    // Record yesterday's quick sale: ৳2,000
    const yesterdaySale = await request(app)
      .post('/api/v1/sales/quick')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'yesterday-quick-1')
      .send({
        totalSellingPricePoisha: 200000,
        quantity: '20',
        note: 'গতকালের মোট ক্যাশ বিক্রি',
        soldAt: `${yesterday}T14:30:00+06:00`,
        paymentMethod: 'CASH',
      });
    expect(yesterdaySale.status).toBe(201);
    expect(yesterdaySale.body.data.sale.soldAt).toContain(yesterday);

    // Record today's quick sale: ৳3,000
    const todaySale = await request(app)
      .post('/api/v1/sales/quick')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'today-quick-1')
      .send({
        totalSellingPricePoisha: 300000,
        quantity: '30',
        note: 'আজকের বিক্রি',
        paymentMethod: 'CASH',
      });
    expect(todaySale.status).toBe(201);

    // Query dashboard for today: should show today = ৳3,000 and comparison yesterday = ৳2,000 (+50% growth)
    const dashRes = await request(app)
      .get('/api/v1/reports/dashboard?period=day')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.dashboard.todaySalesPoisha).toBe(300000);
    expect(dashRes.body.data.dashboard.comparison.sales.currentPoisha).toBe(300000);
    expect(dashRes.body.data.dashboard.comparison.sales.previousPoisha).toBe(200000);
    expect(dashRes.body.data.dashboard.comparison.sales.growthPercent).toBe(50);
  });

  it('supports credit quick sale and updates customer ledger due balance', async () => {
    const { ownerToken } = await registerTestShop('01911223344');

    // Create a customer
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'মতিউর রহমান',
        phone: '01700112233',
      });
    expect(custRes.status).toBe(201);
    const customerId = custRes.body.data.customer.id;

    // Quick credit sale: total ৳1,000, paid ৳300, due ৳700
    const creditSaleRes = await request(app)
      .post('/api/v1/sales/quick')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'credit-quick-1')
      .send({
        totalSellingPricePoisha: 100000,
        paidPoisha: 30000,
        customerId,
        note: 'বাকি খাতা বিক্রি',
        paymentMethod: 'CASH',
      });
    expect(creditSaleRes.status).toBe(201);
    expect(creditSaleRes.body.data.sale.totalPoisha).toBe(100000);
    expect(creditSaleRes.body.data.sale.paidPoisha).toBe(30000);
    expect(creditSaleRes.body.data.sale.duePoisha).toBe(70000);

    // Customer due ledger should now reflect ৳700 due
    const custCheck = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(custCheck.status).toBe(200);
    expect(custCheck.body.data.customer.duePoisha).toBe(70000);
    expect(custCheck.body.data.customer.totalPurchasedPoisha).toBe(100000);
    expect(custCheck.body.data.customer.totalPaidPoisha).toBe(30000);
  });
});
