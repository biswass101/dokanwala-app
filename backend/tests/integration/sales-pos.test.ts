import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase } from '../../src/database/prisma.js';
import { cleanTestDatabase } from '../helpers/db-reset.js';

describe('Phase 4 Sales, Multi-Unit POS, Credit, Returns & Cancellations API', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await disconnectDatabase();
  });

  async function setupShopWithCatalog(phone = '০১৭১১২২৩৩৪৪', shopNameBn = 'রহিম পান ও মুদি স্টোর') {
    const reg = await request(app).post('/api/v1/auth/register').send({
      shopNameBn,
      ownerName: 'আব্দুর রহিম',
      phone,
      password: 'StrongPassword123',
      preferredLanguage: 'bn',
      preferredDigitStyle: 'bn',
    });
    expect(reg.status).toBe(201);
    const ownerToken = reg.body.data.tokens.accessToken as string;
    const shopId = reg.body.data.shop.id as string;

    const unitsRes = await request(app)
      .get('/api/v1/units')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unitsRes.status).toBe(200);
    const unitMap = new Map<string, string>();
    for (const u of unitsRes.body.data.units as Array<{ id: string; code: string }>) {
      unitMap.set(u.code, u.id);
    }
    const requireUnit = (code: string): string => {
      const id = unitMap.get(code);
      if (!id) throw new Error(`Missing unit code: ${code}`);
      return id;
    };
    const pieceId = requireUnit('PIECE');
    const biraId = requireUnit('BIRA');
    const gramId = requireUnit('GRAM');
    const poyaId = requireUnit('POYA');
    const kgId = requireUnit('KG');

    // Pan: 1 বিড়া = 20 টি, opening 10 বিড়া (200 টি) @ ৳25/বিড়া (avgCost = 1.25 BDT/টি)
    const panRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'রাজশাহীর মিষ্টি পান',
        nameEn: 'Rajshahi Misti Pan',
        baseUnitId: pieceId,
        defaultSaleUnitId: biraId,
        defaultPurchaseUnitId: biraId,
        baseSellingPricePoisha: 200, // ৳2 / টি
        units: [{ unitId: biraId, conversionFactorToBase: '20', sellingPricePoisha: 3500 }], // ৳35 / বিড়া
        openingStock: {
          qtyDisplay: '10',
          unitId: biraId,
          unitCostPoisha: 2500, // 200 টি @ 1.25/টি = 25000 poisha
        },
      });
    expect(panRes.status).toBe(201);

    // Supari: base=গ্রাম, পোয়া=250g @ ৳275, কেজি=1000g @ ৳1100; opening 5kg (5000g) @ ৳855/kg = 0.855000/g
    const supariRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'খুলনার শুকনা সুপারি',
        nameEn: 'Khulna Dried Supari',
        baseUnitId: gramId,
        defaultSaleUnitId: poyaId,
        defaultPurchaseUnitId: kgId,
        baseSellingPricePoisha: 120,
        units: [
          { unitId: poyaId, conversionFactorToBase: '250', sellingPricePoisha: 27500 },
          { unitId: kgId, conversionFactorToBase: '1000', sellingPricePoisha: 110000 },
        ],
        openingStock: {
          qtyDisplay: '5',
          unitId: kgId,
          unitCostPoisha: 85500,
        },
      });
    expect(supariRes.status).toBe(201);

    return {
      ownerToken,
      shopId,
      units: { pieceId, biraId, gramId, poyaId, kgId },
      panId: panRes.body.data.product.id as string,
      supariId: supariRes.body.data.product.id as string,
    };
  }

  it('completes multi-unit & fractional POS sale with split Cash+bKash payments, WAC COGS & idempotent replay', async () => {
    const { ownerToken, units, panId, supariId } = await setupShopWithCatalog();

    // Missing idempotency key must fail validation
    const missingKeyRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '1' }],
        payments: [{ method: 'CASH', amountPoisha: 3500 }],
      });
    expect(missingKeyRes.status).toBe(400);

    const idemKey = 'sale-pos-001';
    // 1 বিড়া Pan (3500) + 5 টি Pan (1000) + 0.5 কেজি Supari (55000) = 59500 subtotal
    // Discount 1500 -> Net 58000; Cash 38000 (tendered 40000 => change 2000) + bKash 20000
    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', idemKey)
      .send({
        items: [
          { productId: panId, unitId: units.biraId, qtyDisplay: '১' },
          { productId: panId, unitId: units.pieceId, qtyDisplay: '৫' },
          { productId: supariId, unitId: units.kgId, qtyDisplay: '০.৫' },
        ],
        discountType: 'FIXED_POISHA',
        discountValue: 1500,
        payments: [
          { method: 'CASH', amountPoisha: 38000 },
          { method: 'BKASH', amountPoisha: 20000, reference: 'BK-90123' },
        ],
        tenderedPoisha: 40000,
        note: 'কাউন্টার নগদ ও বিকাশ বিক্রি',
      });

    expect(saleRes.status).toBe(201);
    expect(saleRes.body.data.idempotencyReplayed).toBe(false);
    const sale = saleRes.body.data.sale;
    expect(sale.receiptNumber).toMatch(/^INV-\d{8}-0001$/);
    expect(sale.status).toBe('COMPLETED');
    expect(sale.subtotalPoisha).toBe(59500);
    expect(sale.discountPoisha).toBe(1500);
    expect(sale.totalPoisha).toBe(58000);
    expect(sale.paidPoisha).toBe(58000);
    expect(sale.duePoisha).toBe(0);
    expect(sale.tenderedPoisha).toBe(40000);
    expect(sale.changePoisha).toBe(2000);
    // COGS = 25 * 125 + 500 * 85.5 = 3125 + 42750 = 45875 poisha
    expect(sale.cogsPoisha).toBe(45875);
    expect(sale.estimatedProfitPoisha).toBe(12125);
    expect(sale.items).toHaveLength(3);
    expect(sale.payments).toHaveLength(2);

    // Replay same request with same X-Idempotency-Key
    const replayRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', idemKey)
      .send({
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '1' }],
      });
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.data.idempotencyReplayed).toBe(true);
    expect(replayRes.body.data.sale.id).toBe(sale.id);
    expect(replayRes.body.data.sale.receiptNumber).toBe(sale.receiptNumber);

    // Stock should be deducted once: Pan 200 - 25 = 175, Supari 5000 - 500 = 4500
    const panAfter = await request(app)
      .get(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(panAfter.body.data.product.inventory.qtyBase).toBe('175.0000');

    const supariAfter = await request(app)
      .get(`/api/v1/products/${supariId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(supariAfter.body.data.product.inventory.qtyBase).toBe('4500.0000');

    // SALE_OUT movements recorded cleanly
    const movRes = await request(app)
      .get(`/api/v1/inventory/movements?productId=${panId}&type=SALE_OUT`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(movRes.status).toBe(200);
    expect(movRes.body.data.movements).toHaveLength(2);
  });

  it('enforces customer linkage for credit (Baki) sales and handles partial & full returns with discount settlement', async () => {
    const { ownerToken, units, panId, supariId } = await setupShopWithCatalog();

    // Credit sale without customerId fails with 422
    const noCustCredit = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'no-cust-credit')
      .send({
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '2' }],
        payments: [],
      });
    expect(noCustCredit.status).toBe(422);
    expect(noCustCredit.body.error.code).toBe('BUSINESS_RULE_VIOLATION');

    // Create customer Jamal
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'জামাল স্টোর',
        nameEn: 'Jamal Store',
        phone: '০১৮১১২২৩৩৪৪',
        address: 'চকবাজার গলি',
      });
    expect(custRes.status).toBe(201);
    const customerId = custRes.body.data.customer.id as string;

    // Sell 2 Bira Pan (7000) + 2 Poya Supari (55000) = 62000, 10% discount (6200) -> net 55800
    // Paid 30000 Cash -> Due 25800
    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'credit-sale-1')
      .send({
        customerId,
        items: [
          { productId: panId, unitId: units.biraId, qtyDisplay: '2' },
          { productId: supariId, unitId: units.poyaId, qtyDisplay: '2' },
        ],
        discountType: 'PERCENT',
        discountValue: '১০',
        payments: [{ method: 'CASH', amountPoisha: 30000 }],
      });
    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data.sale;
    expect(sale.totalPoisha).toBe(55800);
    expect(sale.paidPoisha).toBe(30000);
    expect(sale.duePoisha).toBe(25800);

    const duesRes = await request(app)
      .get('/api/v1/customers?withDuesOnly=true')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(duesRes.status).toBe(200);
    expect(duesRes.body.data.customers[0]).toMatchObject({
      id: customerId,
      totalPurchasedPoisha: 55800,
      totalPaidPoisha: 30000,
      duePoisha: 25800,
    });

    const saleItemsList = sale.items as { id: string; productId: string }[];
    const panSaleItem = saleItemsList.find((it) => it.productId === panId);
    const supariSaleItem = saleItemsList.find((it) => it.productId === supariId);
    if (!panSaleItem || !supariSaleItem) {
      throw new Error('Missing expected Pan or Supari sale item');
    }
    const panSaleItemId = panSaleItem.id;
    const supariSaleItemId = supariSaleItem.id;

    // Over-return rejected (409 RETURN_EXCEEDS_SOLD)
    const overReturn = await request(app)
      .post(`/api/v1/sales/${sale.id as string}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'ret-over-1')
      .send({
        refundMethod: 'CREDIT_ADJUSTMENT',
        items: [{ saleItemId: panSaleItemId, qtyDisplay: '3' }],
      });
    expect(overReturn.status).toBe(409);
    expect(overReturn.body.error.code).toBe('RETURN_EXCEEDS_SOLD');

    // Partial return: 1 Bira Pan (3500 gross, 350 discount adj -> 3150 net) via CREDIT_ADJUSTMENT
    const partRetRes = await request(app)
      .post(`/api/v1/sales/${sale.id as string}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'ret-part-1')
      .send({
        refundMethod: 'CREDIT_ADJUSTMENT',
        items: [{ saleItemId: panSaleItemId, qtyDisplay: '1' }],
        reason: '১ বিড়া পান ফেরত',
      });
    expect(partRetRes.status).toBe(201);
    expect(partRetRes.body.data.saleReturn.returnNumber).toMatch(/^RET-\d{8}-0001$/);
    expect(partRetRes.body.data.saleReturn.refundTotalPoisha).toBe(3150);
    expect(partRetRes.body.data.saleReturn.creditAdjustedPoisha).toBe(3150);
    expect(partRetRes.body.data.saleReturn.cashRefundPoisha).toBe(0);
    expect(partRetRes.body.data.sale.status).toBe('PARTIALLY_RETURNED');
    expect(partRetRes.body.data.sale.duePoisha).toBe(22650);

    // Final return of remaining 1 Bira Pan + 2 Poya Supari via CASH settles remaining 22650 due + 30000 cash
    const finalRetRes = await request(app)
      .post(`/api/v1/sales/${sale.id as string}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'ret-final-2')
      .send({
        refundMethod: 'CASH',
        items: [
          { saleItemId: panSaleItemId, qtyDisplay: '1' },
          { saleItemId: supariSaleItemId, qtyDisplay: '2' },
        ],
        reason: 'বাকি সব পণ্য ফেরত',
      });
    expect(finalRetRes.status).toBe(201);
    expect(finalRetRes.body.data.saleReturn.refundTotalPoisha).toBe(52650);
    expect(finalRetRes.body.data.saleReturn.cashRefundPoisha).toBe(30000);
    expect(finalRetRes.body.data.saleReturn.creditAdjustedPoisha).toBe(22650);
    expect(finalRetRes.body.data.sale.status).toBe('RETURNED');
    expect(finalRetRes.body.data.sale.duePoisha).toBe(0);
    expect(finalRetRes.body.data.sale.returnedTotalPoisha).toBe(55800);
    expect(finalRetRes.body.data.sale.estimatedProfitPoisha).toBe(0);

    // Customer balance returns cleanly to zero and inventory fully restored
    const custAfter = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(custAfter.body.data.customers[0].duePoisha).toBe(0);

    const panRestored = await request(app)
      .get(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(panRestored.body.data.product.inventory.qtyBase).toBe('200.0000');

    const supariRestored = await request(app)
      .get(`/api/v1/products/${supariId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(supariRestored.body.data.product.inventory.qtyBase).toBe('5000.0000');
  });

  it('enforces Employee RBAC rules, atomic stock rollback, Owner-only cancellation & multi-tenant isolation', async () => {
    const { ownerToken, units, panId } = await setupShopWithCatalog();

    // Update shop policy: max employee discount 10%, employees cannot give credit
    const patchShop = await request(app)
      .patch('/api/v1/shop')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeMaxDiscountPercent: 10,
        employeeCanGiveCredit: false,
      });
    expect(patchShop.status).toBe(200);

    // Create employee account
    const empCreate = await request(app)
      .post('/api/v1/shop/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'করিম কর্মচারী',
        phone: '01911223344',
        password: 'EmployeePassword123',
      });
    expect(empCreate.status).toBe(201);

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01911223344',
      password: 'EmployeePassword123',
    });
    expect(empLogin.status).toBe(200);
    const empToken = empLogin.body.data.tokens.accessToken as string;

    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ nameBn: 'আলিফ মিয়া' });
    const customerId = custRes.body.data.customer.id as string;

    // 1. Employee discount > 10% blocked (403 FORBIDDEN_ROLE)
    const highDiscount = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Idempotency-Key', 'emp-high-disc')
      .send({
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '2' }],
        discountType: 'PERCENT',
        discountValue: 15,
        payments: [{ method: 'CASH', amountPoisha: 5950 }],
      });
    expect(highDiscount.status).toBe(403);
    expect(highDiscount.body.error.code).toBe('FORBIDDEN_ROLE');

    // 2. Employee credit sale blocked when employeeCanGiveCredit is false
    const empCredit = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Idempotency-Key', 'emp-credit')
      .send({
        customerId,
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '1' }],
        payments: [],
      });
    expect(empCredit.status).toBe(403);
    expect(empCredit.body.error.code).toBe('FORBIDDEN_ROLE');

    // 3. Atomic insufficient stock rollback across combined Pan lines (6 Bira + 5 Bira = 220 টি > 200 available)
    const overStock = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Idempotency-Key', 'over-stock')
      .send({
        items: [
          { productId: panId, unitId: units.biraId, qtyDisplay: '6' },
          { productId: panId, unitId: units.biraId, qtyDisplay: '5' },
        ],
        payments: [],
      });
    expect(overStock.status).toBe(409);
    expect(overStock.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Stock remained 200.0000 after rollback
    const panUnchanged = await request(app)
      .get(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(panUnchanged.body.data.product.inventory.qtyBase).toBe('200.0000');

    // 4. Valid Employee sale within 10% discount strips COGS/profit fields from response
    const validEmpSale = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Idempotency-Key', 'emp-valid-1')
      .send({
        customerId,
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '2' }], // 7000 subtotal
        discountType: 'FIXED_POISHA',
        discountValue: 700, // exact 10% -> allowed
        payments: [{ method: 'CASH', amountPoisha: 6300 }],
      });
    expect(validEmpSale.status).toBe(201);
    const empSale = validEmpSale.body.data.sale;
    expect(empSale.cogsPoisha).toBeNull();
    expect(empSale.estimatedProfitPoisha).toBeNull();
    expect(empSale.items[0].unitCostAtSaleBdt).toBeNull();
    expect(empSale.items[0].lineCogsPoisha).toBeNull();

    // 5. Employee cannot cancel sale; Owner cancels it cleanly and restores stock
    const empCancel = await request(app)
      .post(`/api/v1/sales/${empSale.id as string}/cancel`)
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Idempotency-Key', 'emp-cancel')
      .send({ reason: 'ভুল এন্ট্রি' });
    expect(empCancel.status).toBe(403);

    const ownerCancel = await request(app)
      .post(`/api/v1/sales/${empSale.id as string}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'owner-cancel-1')
      .send({ reason: 'ভুল হিসাব বাতিল' });
    expect(ownerCancel.status).toBe(200);
    expect(ownerCancel.body.data.sale.status).toBe('CANCELLED');
    expect(ownerCancel.body.data.sale.estimatedProfitPoisha).toBe(0);

    const panAfterCancel = await request(app)
      .get(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(panAfterCancel.body.data.product.inventory.qtyBase).toBe('200.0000');

    // 6. Cross-tenant isolation: Second shop cannot view or modify Shop 1 sale
    const shop2 = await setupShopWithCatalog('01611223344', 'অন্য দোকান');
    const crossGet = await request(app)
      .get(`/api/v1/sales/${empSale.id as string}`)
      .set('Authorization', `Bearer ${shop2.ownerToken}`);
    expect(crossGet.status).toBe(404);
  });
});
