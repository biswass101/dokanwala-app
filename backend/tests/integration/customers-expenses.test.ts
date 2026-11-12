import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase, prisma } from '../../src/database/prisma.js';
import { cleanTestDatabase } from '../helpers/db-reset.js';

describe('Phase 6 Customers (বাকি খাতা), Due Collections & Expenses API', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await disconnectDatabase();
  });

  async function setupShopWithProductAndStaff(phone = '০১৭১১০০০০১১') {
    const reg = await request(app).post('/api/v1/auth/register').send({
      shopNameBn: 'করিম পান ও মুদি ভান্ডার',
      ownerName: 'আব্দুল করিম',
      phone,
      password: 'StrongPassword123',
      preferredLanguage: 'bn',
      preferredDigitStyle: 'bn',
    });
    expect(reg.status).toBe(201);
    const ownerToken = reg.body.data.tokens.accessToken as string;
    const shopId = reg.body.data.shop.id as string;

    const empPhone = phone.includes('২০২০২০') ? '০১৮১১২২৩৩৪৪' : '০১৮১১৫৫৬৬৭৭';
    const staffRes = await request(app)
      .post('/api/v1/shop/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'হাবিবুর রহমান',
        phone: empPhone,
        password: 'EmployeePass123',
        pin: '1357',
      });
    expect(staffRes.status).toBe(201);

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      phone: empPhone,
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

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'রাজশাহীর পান',
        baseUnitId: pieceUnit.id,
        defaultSaleUnitId: pieceUnit.id,
        defaultPurchaseUnitId: pieceUnit.id,
        baseSellingPricePoisha: 500, // ৳5/pc
        lastPurchasePricePoisha: 200,
        openingStock: {
          qtyDisplay: '100',
          unitId: pieceUnit.id,
          unitCostPoisha: 200,
        },
      });
    expect(prodRes.status).toBe(201);

    return {
      ownerToken,
      employeeToken,
      shopId,
      pieceUnitId: pieceUnit.id,
      productId: prodRes.body.data.product.id as string,
    };
  }

  it('tracks credit sales -> FIFO/targeted customer due collections without duplicating sales revenue, reconciles ledger, and enforces RBAC', async () => {
    const { ownerToken, employeeToken, pieceUnitId, productId } =
      await setupShopWithProductAndStaff('০১৭১১২০২০২০');

    // Create customer with Bangla digits phone
    const createCust = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'জামাল উদ্দিন',
        nameEn: 'Jamal Uddin',
        phone: '০১৯১১-৫৫৬৬৭৭',
        address: 'নবাবপুর রোড',
      });
    expect(createCust.status).toBe(201);
    const customerId = createCust.body.data.customer.id as string;
    expect(createCust.body.data.customer.phone).toBe('+8801911556677');

    // Sale 1: 30 pcs @ ৳5 = ৳150 (15000 poisha), full বাকি
    const sale1Res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        customerId,
        items: [{ productId, unitId: pieceUnitId, qtyDisplay: '30' }],
        payments: [],
        note: 'সকালের বাকি',
      });
    expect(sale1Res.status).toBe(201);
    const sale1Id = sale1Res.body.data.sale.id as string;

    // Sale 2: 50 pcs @ ৳5 = ৳250 (25000 poisha), ৳50 cash + ৳200 বাকি
    const sale2Res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        customerId,
        items: [{ productId, unitId: pieceUnitId, qtyDisplay: '50' }],
        payments: [{ method: 'CASH', amountPoisha: 5000 }],
      });
    expect(sale2Res.status).toBe(201);
    const sale2Id = sale2Res.body.data.sale.id as string;

    // Customer totals: purchased 40000, paid 5000, due 35000
    const beforePayCust = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(beforePayCust.status).toBe(200);
    expect(beforePayCust.body.data.customer.totalPurchasedPoisha).toBe(40000);
    expect(beforePayCust.body.data.customer.totalPaidPoisha).toBe(5000);
    expect(beforePayCust.body.data.customer.duePoisha).toBe(35000);

    // Overpayment beyond customer due must fail
    const overpayRes = await request(app)
      .post(`/api/v1/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        method: 'CASH',
        amountPoisha: 35001,
      });
    expect(overpayRes.status).toBe(422);
    expect(overpayRes.body.error.code).toBe('BUSINESS_RULE_VIOLATION');

    // Collect ৳250 (25000 poisha) via bKash with idempotency key (FIFO: 15000 to Sale 1 + 10000 to Sale 2)
    const payIdemp = crypto.randomUUID();
    const collectRes = await request(app)
      .post(`/api/v1/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', payIdemp)
      .send({
        method: 'BKASH',
        amountPoisha: 25000,
        reference: 'BKX-901',
        note: 'বিকাশে বাকি আদায়',
      });
    expect(collectRes.status).toBe(201);
    expect(collectRes.body.data.idempotencyReplayed).toBe(false);
    expect(collectRes.body.data.customer.totalPurchasedPoisha).toBe(40000);
    expect(collectRes.body.data.customer.totalPaidPoisha).toBe(30000);
    expect(collectRes.body.data.customer.duePoisha).toBe(10000);

    // Idempotency replay must return 200 without reducing due again
    const replayRes = await request(app)
      .post(`/api/v1/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', payIdemp)
      .send({
        method: 'BKASH',
        amountPoisha: 25000,
      });
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.data.idempotencyReplayed).toBe(true);
    expect(replayRes.body.data.customer.duePoisha).toBe(10000);

    // Accounting Invariant: Collecting customer due must NEVER create a duplicate Sale or inflate Sale.paidPoisha
    const salesList = await request(app)
      .get(`/api/v1/sales?customerId=${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(salesList.status).toBe(200);
    expect(salesList.body.data.sales).toHaveLength(2);

    const refreshedSale1 = await request(app)
      .get(`/api/v1/sales/${sale1Id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(refreshedSale1.body.data.sale.paidPoisha).toBe(0);
    expect(refreshedSale1.body.data.sale.settledDuePoisha).toBe(15000);
    expect(refreshedSale1.body.data.sale.duePoisha).toBe(0);

    const refreshedSale2 = await request(app)
      .get(`/api/v1/sales/${sale2Id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(refreshedSale2.body.data.sale.paidPoisha).toBe(5000);
    expect(refreshedSale2.body.data.sale.settledDuePoisha).toBe(10000);
    expect(refreshedSale2.body.data.sale.duePoisha).toBe(10000);

    // Cannot void Sale 1 once subsequent due collection settled it
    const cancelSettledRes = await request(app)
      .post(`/api/v1/sales/${sale1Id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'ভুল বিল' });
    expect(cancelSettledRes.status).toBe(422);

    // Return 1 item (৳5 = 500 poisha) on Sale 2 using CREDIT_ADJUSTMENT
    const sale2ItemId = refreshedSale2.body.data.sale.items[0].id as string;
    const returnRes = await request(app)
      .post(`/api/v1/sales/${sale2Id}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        refundMethod: 'CREDIT_ADJUSTMENT',
        items: [{ saleItemId: sale2ItemId, qtyDisplay: '1' }],
        reason: 'পাতা নষ্ট',
      });
    expect(returnRes.status).toBe(201);

    // Ledger chronological check & running due reconciliation (35000 -> -25000 -> -500 = 9500)
    const ledgerRes = await request(app)
      .get(`/api/v1/customers/${customerId}/ledger`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.data.customer.duePoisha).toBe(9500);
    const entries = ledgerRes.body.data.entries as Array<{
      type: string;
      dueDeltaPoisha: number;
      runningDuePoisha: number;
    }>;
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.type)).toEqual(['SALE', 'SALE', 'CUSTOMER_PAYMENT', 'SALE_RETURN']);
    expect(entries[entries.length - 1]?.runningDuePoisha).toBe(9500);

    // RBAC: When owner disables employeeCanGiveCredit, employee due collection fails with 403
    const policyRes = await request(app)
      .patch('/api/v1/shop')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ employeeCanGiveCredit: false });
    expect(policyRes.status).toBe(200);

    const blockedEmpPay = await request(app)
      .post(`/api/v1/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({ method: 'CASH', amountPoisha: 1000 });
    expect(blockedEmpPay.status).toBe(403);
    expect(blockedEmpPay.body.error.code).toBe('FORBIDDEN_ROLE');

    // Update customer with optimistic lock & archive guard
    const editCustRes = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        address: 'চকবাজার',
        expectedVersion: ledgerRes.body.data.customer.version,
      });
    expect(editCustRes.status).toBe(200);
    expect(editCustRes.body.data.customer.address).toBe('চকবাজার');

    const staleEditRes = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'পুরানো ভার্সন',
        expectedVersion: 1,
      });
    expect(staleEditRes.status).toBe(409);
    expect(staleEditRes.body.error.code).toBe('VERSION_CONFLICT');

    const archiveBlocked = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isActive: false });
    expect(archiveBlocked.status).toBe(422);

    const archiveConfirmed = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isActive: false, confirmWithDue: true });
    expect(archiveConfirmed.status).toBe(200);
    expect(archiveConfirmed.body.data.customer.isActive).toBe(false);
  });

  it('seeds Bangladeshi expense categories, records immutable ExpenseAuditLog history on edits, enforces RBAC, and evaluates Asia/Dhaka date filters', async () => {
    const { ownerToken, employeeToken, shopId } = await setupShopWithProductAndStaff('০১৭১১৩০৩০৩০');

    // Default Bangladeshi categories must already be seeded
    const catListRes = await request(app)
      .get('/api/v1/expense-categories')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(catListRes.status).toBe(200);
    const categories = catListRes.body.data.categories as Array<{ id: string; nameBn: string }>;
    expect(categories.length).toBeGreaterThanOrEqual(7);
    expect(categories.some((c) => c.nameBn === 'বিদ্যুৎ বিল')).toBe(true);
    expect(categories.some((c) => c.nameBn === 'দোকান ভাড়া')).toBe(true);

    const electricCat = categories.find((c) => c.nameBn === 'বিদ্যুৎ বিল');
    const rentCat = categories.find((c) => c.nameBn === 'দোকান ভাড়া');
    if (!electricCat || !rentCat) throw new Error('Missing seeded expense categories');

    // Employee cannot create expense category
    const empCatRes = await request(app)
      .post('/api/v1/expense-categories')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ nameBn: 'নাস্তা খরচ' });
    expect(empCatRes.status).toBe(403);

    // Owner creates custom category
    const ownerCatRes = await request(app)
      .post('/api/v1/expense-categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ nameBn: 'আপ্যায়ন ও চা', nameEn: 'Tea & Hospitality' });
    expect(ownerCatRes.status).toBe(201);
    const customCatId = ownerCatRes.body.data.category.id as string;

    // Employee records a daily expense with Asia/Dhaka early morning timestamp (2026-11-11T19:00:00Z = 2026-11-12 01:00 BST)
    const expIdemp = crypto.randomUUID();
    const createExpRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Idempotency-Key', expIdemp)
      .send({
        categoryId: electricCat.id,
        amountPoisha: 120000, // ৳1200
        method: 'BKASH',
        reference: 'DESCO-4421',
        note: 'নভেম্বর বিদ্যুৎ বিল',
        incurredAt: '2026-11-11T19:00:00.000Z',
      });
    expect(createExpRes.status).toBe(201);
    const expenseId = createExpRes.body.data.expense.id as string;
    expect(createExpRes.body.data.expense.version).toBe(1);

    // Idempotency replay
    const expReplay = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Idempotency-Key', expIdemp)
      .send({
        categoryId: electricCat.id,
        amountPoisha: 120000,
        method: 'BKASH',
      });
    expect(expReplay.status).toBe(200);
    expect(expReplay.body.data.idempotencyReplayed).toBe(true);

    // Owner records another expense on different day/category
    const exp2Res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', crypto.randomUUID())
      .send({
        categoryId: rentCat.id,
        amountPoisha: 800000, // ৳8000
        method: 'CASH',
        note: 'দোকান ভাড়া পরিশোধ',
        incurredAt: '2026-11-10T06:00:00.000Z', // 2026-11-10 12:00 BST
      });
    expect(exp2Res.status).toBe(201);

    // Employee CANNOT edit expense or view audit logs
    const empEditBlocked = await request(app)
      .patch(`/api/v1/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ amountPoisha: 50000, reason: 'ভুল' });
    expect(empEditBlocked.status).toBe(403);
    expect(empEditBlocked.body.error.code).toBe('FORBIDDEN_ROLE');

    const empHistoryBlocked = await request(app)
      .get(`/api/v1/expenses/${expenseId}/history`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empHistoryBlocked.status).toBe(403);

    // Owner edits expense (changes category, amount, method, note, reason)
    const ownerEditRes = await request(app)
      .patch(`/api/v1/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        categoryId: customCatId,
        amountPoisha: 135000,
        method: 'CASH',
        note: 'বিদ্যুৎ + চা বিল সংশোধিত',
        reason: 'বিলের রসিদ অনুযায়ী সংশোধন',
        expectedVersion: 1,
      });
    expect(ownerEditRes.status).toBe(200);
    expect(ownerEditRes.body.data.expense.version).toBe(2);
    expect(ownerEditRes.body.data.expense.amountPoisha).toBe(135000);
    expect(ownerEditRes.body.data.expense.categoryNameBn).toBe('আপ্যায়ন ও চা'.normalize('NFC'));

    // Audit trail verification
    const historyRes = await request(app)
      .get(`/api/v1/expenses/${expenseId}/history`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(historyRes.status).toBe(200);
    const history = historyRes.body.data.history as Array<{
      action: string;
      beforeJson: { amountPoisha: number; categoryNameBn: string; method: string } | null;
      afterJson: { amountPoisha: number; categoryNameBn: string; method: string };
      reason: string | null;
    }>;
    expect(history).toHaveLength(2);
    expect(history[0]?.action).toBe('UPDATED');
    expect(history[0]?.beforeJson?.amountPoisha).toBe(120000);
    expect(history[0]?.beforeJson?.categoryNameBn).toBe('বিদ্যুৎ বিল');
    expect(history[0]?.afterJson.amountPoisha).toBe(135000);
    expect(history[0]?.afterJson.categoryNameBn).toBe('আপ্যায়ন ও চা'.normalize('NFC'));
    expect(history[0]?.reason).toBe('বিলের রসিদ অনুযায়ী সংশোধন'.normalize('NFC'));
    expect(history[1]?.action).toBe('CREATED');
    expect(history[1]?.beforeJson).toBeNull();

    // Verify Asia/Dhaka date filter: 2026-11-11T19:00Z MUST match from=2026-11-12&to=2026-11-12
    const dhakaFilterRes = await request(app)
      .get('/api/v1/expenses?from=2026-11-12&to=2026-11-12')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(dhakaFilterRes.status).toBe(200);
    expect(dhakaFilterRes.body.data.expenses).toHaveLength(1);
    expect(dhakaFilterRes.body.data.expenses[0].id).toBe(expenseId);
    expect(dhakaFilterRes.body.data.totalExpensePoisha).toBe(135000);

    // Verify category filter & total summary
    const rentFilterRes = await request(app)
      .get(`/api/v1/expenses?categoryId=${rentCat.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(rentFilterRes.status).toBe(200);
    expect(rentFilterRes.body.data.expenses).toHaveLength(1);
    expect(rentFilterRes.body.data.totalExpensePoisha).toBe(800000);

    // Tenant isolation: Shop B cannot access Shop A's expense or customer
    const shopBReg = await request(app).post('/api/v1/auth/register').send({
      shopNameBn: 'দ্বিতীয় দোকান',
      ownerName: 'সালমান',
      phone: '০১৭৮৮৯৯০০১১',
      password: 'StrongPassword123',
    });
    expect(shopBReg.status).toBe(201);
    const shopBToken = shopBReg.body.data.tokens.accessToken as string;

    const crossShopExpense = await request(app)
      .get(`/api/v1/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${shopBToken}`);
    expect(crossShopExpense.status).toBe(404);

    const dbCountShopA = await prisma.expense.count({ where: { shopId } });
    expect(dbCountShopA).toBe(2);
  });
});
