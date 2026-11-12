import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase, prisma } from '../../src/database/prisma.js';
import { cleanTestDatabase } from '../helpers/db-reset.js';

describe('Phase 7 Daily Cashbook, Financial Reports & P&L Reconciliation API', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await disconnectDatabase();
  });

  async function setupShopWithStaffCatalogAndParties() {
    const reg = await request(app).post('/api/v1/auth/register').send({
      shopNameBn: 'বিক্রমপুর পান ও মুদি ভান্ডার',
      ownerName: 'মোঃ রহিম',
      phone: '০১৭১১৩৩০৩৩০',
      password: 'StrongPassword123',
      preferredLanguage: 'bn',
      preferredDigitStyle: 'bn',
    });
    expect(reg.status).toBe(201);
    const ownerToken = reg.body.data.tokens.accessToken as string;
    const shopId = reg.body.data.shop.id as string;

    const staffRes = await request(app)
      .post('/api/v1/shop/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'সেলিম মিয়া',
        phone: '০১৮১১৩৩০৩৩০',
        password: 'EmployeePass123',
        pin: '2468',
      });
    expect(staffRes.status).toBe(201);

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '০১৮১১৩৩০৩৩০',
      password: 'EmployeePass123',
    });
    expect(empLogin.status).toBe(200);
    const employeeToken = empLogin.body.data.tokens.accessToken as string;

    const unitsRes = await request(app)
      .get('/api/v1/units')
      .set('Authorization', `Bearer ${ownerToken}`);
    const pieceUnit = (unitsRes.body.data.units as Array<{ id: string; code: string }>).find(
      (u) => u.code === 'PIECE',
    );
    if (!pieceUnit) throw new Error('Missing PIECE unit');

    // Product 1: Pan @ ৳5 sell, ৳2 cost
    const prod1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'বাংলা মিষ্টি পান',
        baseUnitId: pieceUnit.id,
        defaultSaleUnitId: pieceUnit.id,
        defaultPurchaseUnitId: pieceUnit.id,
        baseSellingPricePoisha: 500, // ৳5/pc
        lastPurchasePricePoisha: 200, // ৳2/pc
        lowStockThresholdBase: '10',
        openingStock: {
          qtyDisplay: '100',
          unitId: pieceUnit.id,
          unitCostPoisha: 200,
        },
      });
    expect(prod1Res.status).toBe(201);
    const panProductId = prod1Res.body.data.product.id as string;

    // Product 2: Supari @ ৳10 sell, ৳6 cost
    const prod2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'দেশি সুপারি',
        baseUnitId: pieceUnit.id,
        defaultSaleUnitId: pieceUnit.id,
        defaultPurchaseUnitId: pieceUnit.id,
        baseSellingPricePoisha: 1000, // ৳10/pc
        lastPurchasePricePoisha: 600, // ৳6/pc
        lowStockThresholdBase: '50',
        openingStock: {
          qtyDisplay: '20', // already low stock (20 <= 50)
          unitId: pieceUnit.id,
          unitCostPoisha: 600,
        },
      });
    expect(prod2Res.status).toBe(201);
    const supariProductId = prod2Res.body.data.product.id as string;

    // Customer
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'করিম বেপারী',
        phone: '০১৯১১৩৩০৩৩০',
      });
    expect(custRes.status).toBe(201);
    const customerId = custRes.body.data.customer.id as string;

    // Supplier
    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'যশোর পান আড়ত',
        phone: '০১৭২২৩৩০৩৩০',
      });
    expect(supRes.status).toBe(201);
    const supplierId = supRes.body.data.supplier.id as string;

    // Expense Category
    const expCatRes = await request(app)
      .get('/api/v1/expense-categories')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(expCatRes.status).toBe(200);
    const firstExpCat = (expCatRes.body.data.categories as Array<{ id: string }>)[0];
    if (!firstExpCat) throw new Error('Missing seeded expense category');

    return {
      shopId,
      ownerToken,
      employeeToken,
      pieceUnitId: pieceUnit.id,
      panProductId,
      supariProductId,
      customerId,
      supplierId,
      expenseCategoryId: firstExpCat.id,
    };
  }

  it('reconciles Cashbook inflows/outflows across Cash, bKash, Nagad, expense deltas, close variance & P&L formulas exactly', async () => {
    const {
      ownerToken,
      employeeToken,
      pieceUnitId,
      panProductId,
      supariProductId,
      customerId,
      supplierId,
      expenseCategoryId,
    } = await setupShopWithStaffCatalogAndParties();

    // 1. Open Cashbook with ৳1,000.00 (100000 poisha)
    const openRes = await request(app)
      .post('/api/v1/cashbook/open')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ openingCashPoisha: 100000, note: 'সকালের ক্যাশ খোলা' });
    expect(openRes.status).toBe(201);
    expect(openRes.body.data.session.status).toBe('OPEN');
    expect(openRes.body.data.liveExpectedClosingCashPoisha).toBe(100000);

    // 2. Sale 1: 60 Pan (60 * 500 = 30000 subtotal, COGS = 60 * 200 = 12000)
    //    Discount: 2000 fixed -> Net = 28000 (৳280)
    //    Payments: 15000 CASH + 5000 BKASH, Credit (বাকি): 8000
    const sale1Res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        customerId,
        items: [{ productId: panProductId, unitId: pieceUnitId, qtyDisplay: '60' }],
        discountType: 'FIXED_POISHA',
        discountValue: 2000,
        payments: [
          { method: 'CASH', amountPoisha: 15000 },
          { method: 'BKASH', amountPoisha: 5000 },
        ],
      });
    expect(sale1Res.status).toBe(201);
    const sale1Id = sale1Res.body.data.sale.id as string;
    const sale1ItemId = (sale1Res.body.data.sale.items as Array<{ id: string }>)[0]?.id;
    expect(sale1ItemId).toBeTruthy();

    // 3. Sale 2 (voided later): 10 Pan @ 500 = 5000 CASH, then CANCELLED
    const sale2Res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        items: [{ productId: panProductId, unitId: pieceUnitId, qtyDisplay: '10' }],
        payments: [{ method: 'CASH', amountPoisha: 5000 }],
      });
    expect(sale2Res.status).toBe(201);
    const sale2Id = sale2Res.body.data.sale.id as string;

    const cancelSale2Res = await request(app)
      .post(`/api/v1/sales/${sale2Id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'ভুল এন্ট্রি বাতিল' });
    expect(cancelSale2Res.status).toBe(200);

    // 4. Partial Sale Return on Sale 1: Return 10 Pan (subtotal 5000, proportional discount 333 -> refund 4667, Cash refund 4667)
    //    Restored COGS = 10 * 200 = 2000
    const returnRes = await request(app)
      .post(`/api/v1/sales/${sale1Id}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        items: [{ saleItemId: sale1ItemId, qtyDisplay: '10' }],
        refundMethod: 'CASH',
        reason: 'পান শুকনা ছিল',
      });
    expect(returnRes.status).toBe(201);
    const sale1RefundPoisha = returnRes.body.data.saleReturn.refundTotalPoisha as number;
    expect(sale1RefundPoisha).toBe(4667);

    // 5. Customer Due Collection: collect ৳50 (5000 poisha) via NAGAD
    //    Must appear in Cashbook Nagad IN, must NOT inflate Sales Revenue
    const dueCollectRes = await request(app)
      .post(`/api/v1/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        amountPoisha: 5000,
        method: 'NAGAD',
        note: 'বাকি আদায়',
      });
    expect(dueCollectRes.status).toBe(201);

    // 6. Purchase from supplier: 10 Supari @ 600 = 6000 total; paid 4000 CASH, payable 2000
    const purchaseRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        supplierId,
        items: [{ productId: supariProductId, unitId: pieceUnitId, qtyDisplay: '10', unitCostPoisha: 600 }],
        paidPoisha: 4000,
        paymentMethod: 'CASH',
      });
    expect(purchaseRes.status).toBe(201);
    const purchaseId = purchaseRes.body.data.purchase.id as string;
    const purchaseItemId = (purchaseRes.body.data.purchase.items as Array<{ id: string }>)[0]?.id;

    // 7. Purchase Return: 2 Supari = 1200 cash refund via CASH
    const pretRes = await request(app)
      .post(`/api/v1/purchases/${purchaseId}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        items: [{ purchaseItemId, qtyDisplay: '2' }],
        refundMethod: 'CASH',
        reason: 'পোকা ধরা সুপারি',
      });
    expect(pretRes.status).toBe(201);

    // 8. Supplier Payment: ৳10 (1000 poisha) via CASH
    const supPayRes = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        amountPoisha: 1000,
        method: 'CASH',
        note: 'আড়ত পরিশোধ',
      });
    expect(supPayRes.status).toBe(201);

    // 9. Expense Create (৳100 = 10000 CASH) -> then Edit to ৳150 = 15000 BKASH
    //    Reversing Cash +10000 and deducting bKash -15000 -> Net Cash impact = 0, Net bKash impact = -15000
    const expCreateRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        categoryId: expenseCategoryId,
        amountPoisha: 10000,
        method: 'CASH',
        note: 'সকালের চা-নাস্তা',
      });
    expect(expCreateRes.status).toBe(201);
    const expenseId = expCreateRes.body.data.expense.id as string;

    const expPatchRes = await request(app)
      .patch(`/api/v1/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        amountPoisha: 15000,
        method: 'BKASH',
        reason: 'বিকাশে সংশোধিত খরচ',
      });
    expect(expPatchRes.status).toBe(200);

    // 10. Manual Cashbook Entries: Owner puts ৳200 (20000) CASH in, withdraws ৳50 (5000) CASH out
    const manualIdemKey = crypto.randomUUID();
    const ownerInRes = await request(app)
      .post('/api/v1/cashbook/entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', manualIdemKey)
      .send({
        entryType: 'OWNER_CASH_IN',
        method: 'CASH',
        amountPoisha: 20000,
        note: 'ভাংতি টাকা জমা',
      });
    expect(ownerInRes.status).toBe(201);

    // Replay same manual idempotency key -> 200 idempotent replay, no duplicate row
    const ownerInReplay = await request(app)
      .post('/api/v1/cashbook/entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', manualIdemKey)
      .send({
        entryType: 'OWNER_CASH_IN',
        method: 'CASH',
        amountPoisha: 20000,
        note: 'ভাংতি টাকা জমা',
      });
    expect(ownerInReplay.status).toBe(200);
    expect(ownerInReplay.body.data.idempotencyReplayed).toBe(true);

    const ownerOutRes = await request(app)
      .post('/api/v1/cashbook/entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        entryType: 'OWNER_DRAWING_OUT',
        method: 'CASH',
        amountPoisha: 5000,
        note: 'বাসার বাজার খরচ',
      });
    expect(ownerOutRes.status).toBe(201);

    // 11. Inventory Wastage loss: 5 Pan wasted @ 200 poisha = 1000 poisha loss
    const wasteRes = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        productId: panProductId,
        unitId: pieceUnitId,
        adjustmentType: 'WASTAGE',
        qtyDisplay: '5',
        reason: 'পচে যাওয়া পান ফেলে দেওয়া',
      });
    expect(wasteRes.status).toBe(201);

    // Calculate Exact Expected Cashbook Totals:
    // Cash IN:
    //  + Sale 1: 15000
    //  + Sale 2 (before cancel): 5000
    //  + Purchase Return: 1200
    //  + Expense method-change reversal: 10000
    //  + Owner cash in: 20000
    //  Total Cash IN = 51200
    // Cash OUT:
    //  - Sale 2 cancel: 5000
    //  - Sale 1 refund: 4667
    //  - Purchase 1: 4000
    //  - Supplier payment: 1000
    //  - Original expense: 10000
    //  - Owner drawing: 5000
    //  Total Cash OUT = 29667
    // Net Cash = 51200 - 29667 = 21533
    // Expected Closing Cash = Opening (100000) + Net Cash (21533) = 121533
    // bKash: +5000 (Sale 1) - 15000 (Edited Expense) = -10000
    // Nagad: +5000 (Customer Due Collection)
    const cbRes = await request(app)
      .get('/api/v1/cashbook')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(cbRes.status).toBe(200);
    expect(cbRes.body.data.totals.cashInPoisha).toBe(51200);
    expect(cbRes.body.data.totals.cashOutPoisha).toBe(29667);
    expect(cbRes.body.data.totals.netCashPoisha).toBe(21533);
    expect(cbRes.body.data.liveExpectedClosingCashPoisha).toBe(121533);
    expect(cbRes.body.data.totals.netBkashPoisha).toBe(-10000);
    expect(cbRes.body.data.totals.netNagadPoisha).toBe(5000);

    // 12. Close Cashbook with physical count = 121000 (৳5.33 / 533 poisha short)
    const closeRes = await request(app)
      .post('/api/v1/cashbook/close')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        actualClosingCashPoisha: 121000,
        note: 'দোকান বন্ধের ক্যাশ হিসাব',
      });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.session.status).toBe('CLOSED');
    expect(closeRes.body.data.session.expectedClosingCashPoisha).toBe(121533);
    expect(closeRes.body.data.session.actualClosingCashPoisha).toBe(121000);
    expect(closeRes.body.data.session.variancePoisha).toBe(-533);

    // Re-open restricted to OWNER
    const empReopen = await request(app)
      .post('/api/v1/cashbook/reopen')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ reason: 'try' });
    expect(empReopen.status).toBe(403);
    expect(empReopen.body.error.code).toBe('FORBIDDEN_ROLE');

    // 13. Check Profit & Loss (OWNER):
    // Gross Sales = 30000 (Sale 2 voided so ignored!)
    // Discounts = 2000
    // Sales Returns = 4667
    // Net Sales = 30000 - 2000 - 4667 = 23333
    // Gross COGS = 12000; Restored COGS = 2000 -> Net COGS = 10000
    // Gross Profit = 23333 - 10000 = 13333
    // Wastage Loss = 1000; Operating Expenses = 15000
    // Net Profit = 13333 - 1000 - 15000 = -2667
    // Purchases summary (informational, NOT subtracted twice): gross 6000, return 1200, net 4800, cashPaid 5000
    const pnlRes = await request(app)
      .get('/api/v1/reports/profit-loss')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(pnlRes.status).toBe(200);
    const pnl = pnlRes.body.data.report;
    expect(pnl.grossSalesPoisha).toBe(30000);
    expect(pnl.discountsPoisha).toBe(2000);
    expect(pnl.salesReturnsPoisha).toBe(4667);
    expect(pnl.netSalesPoisha).toBe(23333);
    expect(pnl.grossCogsPoisha).toBe(12000);
    expect(pnl.restoredCogsPoisha).toBe(2000);
    expect(pnl.netCogsPoisha).toBe(10000);
    expect(pnl.grossProfitPoisha).toBe(13333);
    expect(pnl.wastageLossPoisha).toBe(1000);
    expect(pnl.totalInventoryLossPoisha).toBe(1000);
    expect(pnl.totalOperatingExpensesPoisha).toBe(15000);
    expect(pnl.netProfitPoisha).toBe(-2667);
    expect(pnl.purchasesSummary.grossPurchasesPoisha).toBe(6000);
    expect(pnl.purchasesSummary.purchaseReturnsPoisha).toBe(1200);
    expect(pnl.purchasesSummary.netPurchasesPoisha).toBe(4800);
    expect(pnl.purchasesSummary.cashPaidToSuppliersPoisha).toBe(5000);

    // 14. Check Dashboard (OWNER vs EMPLOYEE RBAC masking)
    const ownerDashRes = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerDashRes.status).toBe(200);
    const ownerDash = ownerDashRes.body.data.dashboard;
    expect(ownerDash.todayNetSalesPoisha).toBe(23333);
    expect(ownerDash.todayGrossProfitPoisha).toBe(13333);
    expect(ownerDash.todayWastageLossPoisha).toBe(1000);
    expect(ownerDash.todayExpensesPoisha).toBe(15000);
    expect(ownerDash.todayNetProfitPoisha).toBe(-2667);
    expect(ownerDash.todayDueCollectedPoisha).toBe(5000);
    expect(ownerDash.customerDueTotalPoisha).toBe(3000); // 8000 due - 5000 collected
    expect(ownerDash.supplierPayableTotalPoisha).toBe(1000); // 2000 payable - 1000 paid
    expect(ownerDash.totalProducts).toBe(2);
    expect(ownerDash.lowStockCount).toBe(1); // Supari: 20 + 10 - 2 = 28 <= 50; Pan: 100 - 60 + 10 - 5 = 45 > 10
    expect(ownerDash.cashbookStatus).toBe('CLOSED');
    expect(ownerDash.cashbookExpectedCashPoisha).toBe(121533);

    const empDashRes = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empDashRes.status).toBe(200);
    expect(empDashRes.body.data.dashboard.todayNetSalesPoisha).toBe(23333);
    expect(empDashRes.body.data.dashboard.todayCogsPoisha).toBeNull();
    expect(empDashRes.body.data.dashboard.todayGrossProfitPoisha).toBeNull();
    expect(empDashRes.body.data.dashboard.todayWastageLossPoisha).toBeNull();
    expect(empDashRes.body.data.dashboard.todayNetProfitPoisha).toBeNull();

    // Employee forbidden from P&L & manual cashbook entries
    const empPnlRes = await request(app)
      .get('/api/v1/reports/profit-loss')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empPnlRes.status).toBe(403);
    expect(empPnlRes.body.error.code).toBe('FORBIDDEN_ROLE');

    const empManualEntry = await request(app)
      .post('/api/v1/cashbook/entries')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({ entryType: 'OWNER_CASH_IN', method: 'CASH', amountPoisha: 1000 });
    expect(empManualEntry.status).toBe(403);

    // 15. Check Dues Report & Products Report (with Employee masking)
    const duesRes = await request(app)
      .get('/api/v1/reports/dues')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(duesRes.status).toBe(200);
    expect(duesRes.body.data.report.totalCustomerDuePoisha).toBe(3000);
    expect(duesRes.body.data.report.totalSupplierPayablePoisha).toBe(1000);

    const prodRepOwner = await request(app)
      .get('/api/v1/reports/products')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(prodRepOwner.status).toBe(200);
    expect(prodRepOwner.body.data.report.items[0].productId).toBe(panProductId);
    expect(prodRepOwner.body.data.report.items[0].netQtyBase).toBe('50.0000'); // 60 sold - 10 returned
    expect(prodRepOwner.body.data.report.totalNetCogsPoisha).toBe(10000);
    expect(prodRepOwner.body.data.report.totalNetSalesPoisha).toBe(23333);

    const prodRepEmp = await request(app)
      .get('/api/v1/reports/products')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(prodRepEmp.status).toBe(200);
    expect(prodRepEmp.body.data.report.totalNetCogsPoisha).toBeNull();
    expect(prodRepEmp.body.data.report.totalGrossProfitPoisha).toBeNull();
    expect(prodRepEmp.body.data.report.items[0].netCogsPoisha).toBeNull();
  });

  it('groups sales accurately on Asia/Dhaka midnight boundary (UTC 18:30 = Dhaka 00:30 AM next day)', async () => {
    const { shopId, ownerToken, pieceUnitId, panProductId } =
      await setupShopWithStaffCatalogAndParties();

    // Sale A: 2026-11-11 23:30 BST => 2026-11-11T17:30:00Z
    const saleARes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        items: [{ productId: panProductId, unitId: pieceUnitId, qtyDisplay: '4' }],
        payments: [{ method: 'CASH', amountPoisha: 2000 }],
      });
    expect(saleARes.status).toBe(201);
    const saleAId = saleARes.body.data.sale.id as string;

    // Sale B: 2026-11-12 00:30 BST => 2026-11-11T18:30:00Z
    const saleBRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        items: [{ productId: panProductId, unitId: pieceUnitId, qtyDisplay: '6' }],
        payments: [{ method: 'BKASH', amountPoisha: 3000 }],
      });
    expect(saleBRes.status).toBe(201);
    const saleBId = saleBRes.body.data.sale.id as string;

    await prisma.sale.update({
      where: { id: saleAId },
      data: { soldAt: new Date('2026-11-11T17:30:00.000Z') },
    });
    await prisma.payment.updateMany({
      where: { shopId, saleId: saleAId },
      data: { receivedAt: new Date('2026-11-11T17:30:00.000Z') },
    });

    await prisma.sale.update({
      where: { id: saleBId },
      data: { soldAt: new Date('2026-11-11T18:30:00.000Z') },
    });
    await prisma.payment.updateMany({
      where: { shopId, saleId: saleBId },
      data: { receivedAt: new Date('2026-11-11T18:30:00.000Z') },
    });

    const reportRes = await request(app)
      .get('/api/v1/reports/sales?period=daily&from=2026-11-11&to=2026-11-12')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(reportRes.status).toBe(200);

    const buckets = reportRes.body.data.report.buckets as Array<{
      bucketKey: string;
      netSalesPoisha: number;
    }>;
    const nov11 = buckets.find((b) => b.bucketKey === '2026-11-11');
    const nov12 = buckets.find((b) => b.bucketKey === '2026-11-12');
    expect(nov11?.netSalesPoisha).toBe(2000);
    expect(nov12?.netSalesPoisha).toBe(3000);
    expect(reportRes.body.data.report.paymentBreakdown.cashPoisha).toBe(2000);
    expect(reportRes.body.data.report.paymentBreakdown.bkashPoisha).toBe(3000);
  });
});
