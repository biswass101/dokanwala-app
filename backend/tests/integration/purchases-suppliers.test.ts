import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase, prisma } from '../../src/database/prisma.js';
import { cleanTestDatabase } from '../helpers/db-reset.js';

describe('Phase 5 Purchases, Moving WAC, Suppliers, Payments & Returns API', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await disconnectDatabase();
  });

  async function setupShopWithCatalogAndEmployee(
    phone = '০১৭১১২২৩৩৪৪',
    shopNameBn = 'রহিম পান ও মুদি স্টোর',
  ) {
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

    // Pan: opening 10 বিড়া (200 টি) @ ৳25/বিড়া -> 200 pcs @ 1.250000 BDT/pc
    const panRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'রাজশাহীর মিষ্টি পান',
        nameEn: 'Rajshahi Misti Pan',
        baseUnitId: pieceId,
        defaultSaleUnitId: biraId,
        defaultPurchaseUnitId: biraId,
        baseSellingPricePoisha: 200,
        lastPurchasePricePoisha: 125,
        units: [{ unitId: biraId, conversionFactorToBase: '20', sellingPricePoisha: 3500 }],
        openingStock: {
          qtyDisplay: '10',
          unitId: biraId,
          unitCostPoisha: 2500,
        },
      });
    expect(panRes.status).toBe(201);

    // Supari: opening 5 কেজি (5000 গ্রাম) @ ৳855/কেজি -> 5000g @ 0.855000 BDT/g
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
        lastPurchasePricePoisha: 86,
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

    const empPhone = phone === '০১৭১১২২৩৩৪৪' ? '01811223344' : '01811229999';
    const empCreate = await request(app)
      .post('/api/v1/shop/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'করিম কর্মচারী',
        phone: empPhone,
        password: 'EmployeePassword123',
      });
    expect(empCreate.status).toBe(201);

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      phone: empPhone,
      password: 'EmployeePassword123',
    });
    expect(empLogin.status).toBe(200);

    return {
      ownerToken,
      employeeToken: empLogin.body.data.tokens.accessToken as string,
      shopId,
      units: { pieceId, biraId, gramId, poyaId, kgId },
      panId: panRes.body.data.product.id as string,
      supariId: supariRes.body.data.product.id as string,
    };
  }

  it('enforces RBAC (OWNER-only) and supplier CRUD, duplicate checks & payable archive protection', async () => {
    const { ownerToken, employeeToken, panId, units } = await setupShopWithCatalogAndEmployee();

    // Employee must receive 403 FORBIDDEN_ROLE on all Supplier & Purchase endpoints
    const empSupList = await request(app)
      .get('/api/v1/suppliers')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empSupList.status).toBe(403);
    expect(empSupList.body.error.code).toBe('FORBIDDEN_ROLE');

    const empPurCreate = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Idempotency-Key', 'emp-pur-01')
      .send({
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '1', unitCostPoisha: 2500 }],
        paidPoisha: 2500,
        paymentMethod: 'CASH',
      });
    expect(empPurCreate.status).toBe(403);

    // Owner creates supplier with Bangla digits phone
    const sup1Res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'করিম পান আড়ত',
        nameEn: 'Karim Pan Wholesale',
        phone: '০১৭৫৫-৬৬৭৭৮৮',
        address: 'রাজশাহী সদর',
      });
    expect(sup1Res.status).toBe(201);
    const supplier = sup1Res.body.data.supplier;
    expect(supplier.phone).toBe('+8801755667788');

    // Duplicate phone rejects with 409 DUPLICATE_RESOURCE
    const dupPhoneRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'ডুপ্লিকেট মহাজন',
        phone: '01755667788',
      });
    expect(dupPhoneRes.status).toBe(409);
    expect(dupPhoneRes.body.error.code).toBe('DUPLICATE_RESOURCE');

    // Create a credit purchase so supplier has payable balance
    const creditPurRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pur-sup-payable-1')
      .send({
        supplierId: supplier.id,
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '4', unitCostPoisha: 3000 }],
        paidPoisha: 2000,
        paymentMethod: 'CASH',
      });
    expect(creditPurRes.status).toBe(201);
    expect(creditPurRes.body.data.purchase.duePoisha).toBe(10000);

    // Deactivating supplier while payable > 0 without confirmWithPayable fails 422
    const blockedArchive = await request(app)
      .patch(`/api/v1/suppliers/${supplier.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isActive: false });
    expect(blockedArchive.status).toBe(422);

    // Version conflict returns 409 VERSION_CONFLICT
    const staleVersion = await request(app)
      .patch(`/api/v1/suppliers/${supplier.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ nameBn: 'করিম পান আড়ত আপডেট', expectedVersion: 1 });
    expect(staleVersion.status).toBe(409);
    expect(staleVersion.body.error.code).toBe('VERSION_CONFLICT');

    // Valid update with expectedVersion=2 succeeds (verifies Unicode NFC normalization on 'ড়')
    const validUpdate = await request(app)
      .patch(`/api/v1/suppliers/${supplier.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ address: 'চকবাজার আড়ত', expectedVersion: 2 });
    expect(validUpdate.status).toBe(200);
    expect(validUpdate.body.data.supplier.address).toBe('চকবাজার আড়ত'.normalize('NFC'));
    expect(validUpdate.body.data.supplier.version).toBe(3);

    // Search filter withPayablesOnly
    const dueSuppliersRes = await request(app)
      .get('/api/v1/suppliers?withPayablesOnly=true&q=আড়ত')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(dueSuppliersRes.status).toBe(200);
    expect(dueSuppliersRes.body.data.suppliers).toHaveLength(1);
  });

  it('recalculates Moving WAC accurately across multi-unit Pan & Supari batches, handles idempotency & due guards', async () => {
    const { ownerToken, units, panId, supariId } = await setupShopWithCatalogAndEmployee();

    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ nameBn: 'আলম ট্রেডার্স', phone: '01911223344' });
    expect(supRes.status).toBe(201);
    const supplierId = supRes.body.data.supplier.id as string;

    // Due purchase without supplierId must fail 422
    const noSupplierCredit = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pur-no-sup-due')
      .send({
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '2', unitCostPoisha: 3000 }],
        paidPoisha: 0,
      });
    expect(noSupplierCredit.status).toBe(422);

    // Purchase 1:
    // - 10 বিড়া Pan (200 টি) @ ৳35/বিড়া = ৳350 (35000 poisha)
    //   Old Pan: 200 টি @ 1.25 = 25000 -> New: 400 টি @ (250+350)/400 = 1.500000 BDT/টি; lastPurchase = 175
    // - 5 কেজি Supari (5000 গ্রাম) @ ৳900/কেজি = ৳4,500 (450000 poisha)
    //   Old Supari: 5000g @ 0.855 = 427500 -> New: 10000g @ (4275+4500)/10000 = 0.877500 BDT/g; lastPurchase = 90
    // Subtotal = 485000, Paid Cash = 200000, Due = 285000
    const idemKey = 'pur-wac-001';
    const purRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', idemKey)
      .send({
        supplierId,
        items: [
          { productId: panId, unitId: units.biraId, qtyDisplay: '10', unitCostPoisha: 3500 },
          { productId: supariId, unitId: units.kgId, qtyDisplay: '5', unitCostPoisha: 90000 },
        ],
        paidPoisha: 200000,
        paymentMethod: 'CASH',
        note: 'সকালের পাইকারি চালান',
      });
    expect(purRes.status).toBe(201);
    const purchase = purRes.body.data.purchase;
    expect(purchase.purchaseNumber).toMatch(/^PUR-\d{8}-0001$/);
    expect(purchase.subtotalPoisha).toBe(485000);
    expect(purchase.totalPoisha).toBe(485000);
    expect(purchase.paidPoisha).toBe(200000);
    expect(purchase.duePoisha).toBe(285000);
    expect(purchase.items[0].productId).toBe(panId);
    expect(purchase.items[1].productId).toBe(supariId);

    // Idempotent replay returns 200 without duplicating stock or payables
    const replayRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', idemKey)
      .send({
        supplierId,
        items: [
          { productId: panId, unitId: units.biraId, qtyDisplay: '10', unitCostPoisha: 3500 },
          { productId: supariId, unitId: units.kgId, qtyDisplay: '5', unitCostPoisha: 90000 },
        ],
        paidPoisha: 200000,
        paymentMethod: 'CASH',
      });
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.data.idempotencyReplayed).toBe(true);
    expect(replayRes.body.data.purchase.id).toBe(purchase.id);

    // Verify Pan & Supari InventoryBalance WAC & Product.lastPurchasePricePoisha
    const panAfter = await request(app)
      .get(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(panAfter.body.data.product.inventory.qtyBase).toBe('400.0000');
    expect(panAfter.body.data.product.inventory.avgCostPerBaseBdt).toBe('1.500000');
    expect(panAfter.body.data.product.lastPurchasePricePoisha).toBe(175);

    const supariAfter = await request(app)
      .get(`/api/v1/products/${supariId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(supariAfter.body.data.product.inventory.qtyBase).toBe('10000.0000');
    expect(supariAfter.body.data.product.inventory.avgCostPerBaseBdt).toBe('0.877500');
    expect(supariAfter.body.data.product.lastPurchasePricePoisha).toBe(90);

    // Verify PURCHASE_IN stock movements created
    const movements = await prisma.stockMovement.findMany({
      where: { referenceId: purchase.id, movementType: 'PURCHASE_IN' },
    });
    expect(movements).toHaveLength(2);
  });

  it('tracks supplier payables, FIFO supplier payments, chronological ledger & rejects overpayments', async () => {
    const { ownerToken, units, panId, shopId } = await setupShopWithCatalogAndEmployee();

    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ nameBn: 'ইসলাম মশলা ভান্ডার' });
    const supplierId = supRes.body.data.supplier.id as string;

    const sup2Res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ nameBn: 'দ্বিতীয় মহাজন' });
    const supplier2Id = sup2Res.body.data.supplier.id as string;

    // Purchase 1: total 30000 (300 BDT), paid 10000, due 20000
    const p1Res = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'ledger-p1')
      .send({
        supplierId,
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '10', unitCostPoisha: 3000 }],
        paidPoisha: 10000,
        paymentMethod: 'CASH',
      });
    expect(p1Res.status).toBe(201);
    const p1Id = p1Res.body.data.purchase.id as string;

    // Purchase 2: total 16000 (160 BDT), paid 0, due 16000 -> total payable = 36000
    const p2Res = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'ledger-p2')
      .send({
        supplierId,
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '5', unitCostPoisha: 3200 }],
        paidPoisha: 0,
      });
    expect(p2Res.status).toBe(201);
    const p2Id = p2Res.body.data.purchase.id as string;

    // Record Supplier Payment of 25000 via BKASH (FIFO closes P1 due 20000 + applies 5000 to P2)
    const payRes = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'sup-pay-001')
      .send({
        method: 'BKASH',
        amountPoisha: 25000,
        reference: 'TRX998877',
        note: 'মহাজনের আংশিক বকেয়া পরিশোধ',
      });
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.supplier.payablePoisha).toBe(11000);
    expect(payRes.body.data.supplier.totalPaidPoisha).toBe(35000);

    // Check FIFO settlement reflected cleanly on individual purchases
    const p1Check = await request(app)
      .get(`/api/v1/purchases/${p1Id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(p1Check.body.data.purchase.settledDuePoisha).toBe(20000);
    expect(p1Check.body.data.purchase.duePoisha).toBe(0);

    const p2Check = await request(app)
      .get(`/api/v1/purchases/${p2Id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(p2Check.body.data.purchase.settledDuePoisha).toBe(5000);
    expect(p2Check.body.data.purchase.duePoisha).toBe(11000);

    // Replay with same idempotency key succeeds idempotently
    const payReplay = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'sup-pay-001')
      .send({ method: 'BKASH', amountPoisha: 25000 });
    expect(payReplay.status).toBe(200);
    expect(payReplay.body.data.idempotencyReplayed).toBe(true);
    expect(payReplay.body.data.supplier.payablePoisha).toBe(11000);

    // Reusing same key for another supplier rejects 409 DUPLICATE_RESOURCE
    const wrongSupReplay = await request(app)
      .post(`/api/v1/suppliers/${supplier2Id}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'sup-pay-001')
      .send({ method: 'CASH', amountPoisha: 100 });
    expect(wrongSupReplay.status).toBe(409);

    // Overpayment (> 11000) fails 422 BUSINESS_RULE_VIOLATION
    const overpayRes = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'sup-pay-over')
      .send({ method: 'CASH', amountPoisha: 12000 });
    expect(overpayRes.status).toBe(422);

    // Supplier Ledger shows chronological entries with exact runningPayablePoisha
    const ledgerRes = await request(app)
      .get(`/api/v1/suppliers/${supplierId}/ledger`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.data.entries).toHaveLength(3);
    expect(ledgerRes.body.data.entries[0].type).toBe('PURCHASE');
    expect(ledgerRes.body.data.entries[0].runningPayablePoisha).toBe(20000);
    expect(ledgerRes.body.data.entries[1].type).toBe('PURCHASE');
    expect(ledgerRes.body.data.entries[1].runningPayablePoisha).toBe(36000);
    expect(ledgerRes.body.data.entries[2].type).toBe('SUPPLIER_PAYMENT');
    expect(ledgerRes.body.data.entries[2].runningPayablePoisha).toBe(11000);

    const dbSupplier = await prisma.supplier.findFirstOrThrow({
      where: { id: supplierId, shopId },
    });
    expect(dbSupplier.payablePoisha).toBe(11000);
  });

  it('reverses Moving WAC, stock & supplier payable on partial/full purchase returns and prevents invalid returns or cross-shop access', async () => {
    const { ownerToken, units, panId, supariId } = await setupShopWithCatalogAndEmployee();

    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ nameBn: 'বগুড়া পান হাউস' });
    const supplierId = supRes.body.data.supplier.id as string;

    // Purchase: Pan 10 বিড়া (200 টি) @ ৳45/বিড়া = 45000 poisha (2.25/টি)
    // Old Pan = 200 টি @ 1.25 (25000) + New 200 টি @ 2.25 (45000) = 400 টি @ 1.750000 BDT/টি
    // Supari 2 কেজি @ ৳1,000/কেজি = 200000 poisha, Discount = 5000 poisha
    // Subtotal = 245000, Discount = 5000, Net Total = 240000, Paid = 100000, Due = 140000
    const purRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pur-return-setup')
      .send({
        supplierId,
        items: [
          { productId: panId, unitId: units.biraId, qtyDisplay: '10', unitCostPoisha: 4500 },
          { productId: supariId, unitId: units.kgId, qtyDisplay: '2', unitCostPoisha: 100000 },
        ],
        discountPoisha: 5000,
        paidPoisha: 100000,
        paymentMethod: 'CASH',
      });
    expect(purRes.status).toBe(201);
    const purchase = purRes.body.data.purchase;
    const panLine = purchase.items[0];
    const supariLine = purchase.items[1];

    // Partial Return of 5 বিড়া Pan via PAYABLE_ADJUSTMENT
    const partRetRes = await request(app)
      .post(`/api/v1/purchases/${purchase.id}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pret-part-001')
      .send({
        refundMethod: 'PAYABLE_ADJUSTMENT',
        items: [{ purchaseItemId: panLine.id, qtyDisplay: '5' }],
        reason: 'পান কিছুটা শুকিয়ে গেছে',
      });
    expect(partRetRes.status).toBe(201);
    expect(partRetRes.body.data.purchase.status).toBe('PARTIALLY_RETURNED');
    expect(partRetRes.body.data.purchaseReturn.returnNumber).toMatch(/^PRET-\d{8}-0001$/);
    expect(partRetRes.body.data.purchaseReturn.cashRefundPoisha).toBe(0);
    expect(partRetRes.body.data.purchaseReturn.payableAdjustedPoisha).toBeGreaterThan(0);

    // Exceeding remaining quantity must fail 409 RETURN_EXCEEDS_SOLD
    const overRetRes = await request(app)
      .post(`/api/v1/purchases/${purchase.id}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pret-over-001')
      .send({
        refundMethod: 'CASH',
        items: [{ purchaseItemId: panLine.id, qtyDisplay: '6' }],
      });
    expect(overRetRes.status).toBe(409);
    expect(overRetRes.body.error.code).toBe('RETURN_EXCEEDS_SOLD');

    // Return all remaining quantities (5 বিড়া Pan + 2 কেজি Supari) via CASH
    const fullRetRes = await request(app)
      .post(`/api/v1/purchases/${purchase.id}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pret-full-002')
      .send({
        refundMethod: 'CASH',
        items: [
          { purchaseItemId: panLine.id, qtyDisplay: '5' },
          { purchaseItemId: supariLine.id, qtyDisplay: '2' },
        ],
        reason: 'বাকি মাল ফেরত',
      });
    expect(fullRetRes.status).toBe(201);
    const settledPurchase = fullRetRes.body.data.purchase;
    expect(settledPurchase.status).toBe('RETURNED');
    expect(settledPurchase.duePoisha).toBe(0);
    expect(settledPurchase.returnedTotalPoisha).toBe(240000);
    expect(settledPurchase.cashRefundedPoisha).toBe(100000);

    // Since all Batch 2 goods were returned, Pan & Supari stock and WAC revert cleanly back to opening batch!
    const panRestored = await request(app)
      .get(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(panRestored.body.data.product.inventory.qtyBase).toBe('200.0000');
    expect(panRestored.body.data.product.inventory.avgCostPerBaseBdt).toBe('1.250000');

    const supariRestored = await request(app)
      .get(`/api/v1/products/${supariId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(supariRestored.body.data.product.inventory.qtyBase).toBe('5000.0000');
    expect(supariRestored.body.data.product.inventory.avgCostPerBaseBdt).toBe('0.855000');

    // Verify Supplier balances returned cleanly to 0 across all cumulative totals
    const supCheck = await request(app)
      .get(`/api/v1/suppliers/${supplierId}/ledger`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(supCheck.body.data.supplier.totalPurchasedPoisha).toBe(0);
    expect(supCheck.body.data.supplier.totalPaidPoisha).toBe(0);
    expect(supCheck.body.data.supplier.payablePoisha).toBe(0);
    expect(supCheck.body.data.entries.at(-1).runningPayablePoisha).toBe(0);

    // Returning again when already RETURNED fails 422
    const repeatRet = await request(app)
      .post(`/api/v1/purchases/${purchase.id}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pret-already-done')
      .send({
        refundMethod: 'CASH',
        items: [{ purchaseItemId: panLine.id, qtyDisplay: '1' }],
      });
    expect(repeatRet.status).toBe(422);

    // Returning when stock has been sold out fails 409 INSUFFICIENT_STOCK
    const smallPur = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pur-soldout-check')
      .send({
        items: [{ productId: panId, unitId: units.biraId, qtyDisplay: '1', unitCostPoisha: 2500 }],
        paidPoisha: 2500,
        paymentMethod: 'CASH',
      });
    expect(smallPur.status).toBe(201);
    const smallPurItemId = smallPur.body.data.purchase.items[0].id as string;

    // Sell all 220 pcs of Pan
    const clearSale = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'sale-clear-pan')
      .send({
        items: [{ productId: panId, unitId: units.pieceId, qtyDisplay: '220' }],
        payments: [{ method: 'CASH', amountPoisha: 44000 }],
      });
    expect(clearSale.status).toBe(201);

    const blockedStockRet = await request(app)
      .post(`/api/v1/purchases/${smallPur.body.data.purchase.id}/returns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'pret-no-stock')
      .send({
        refundMethod: 'CASH',
        items: [{ purchaseItemId: smallPurItemId, qtyDisplay: '1' }],
      });
    expect(blockedStockRet.status).toBe(409);
    expect(blockedStockRet.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Cross-shop isolation: Shop 2 owner gets 404 for Shop 1's supplier & purchase
    const shop2 = await setupShopWithCatalogAndEmployee('০১৭৯৯৮৮৭৭৬৬', 'দ্বিতীয় স্টোর');
    const crossSup = await request(app)
      .get(`/api/v1/suppliers/${supplierId}/ledger`)
      .set('Authorization', `Bearer ${shop2.ownerToken}`);
    expect(crossSup.status).toBe(404);

    const crossPur = await request(app)
      .get(`/api/v1/purchases/${purchase.id}`)
      .set('Authorization', `Bearer ${shop2.ownerToken}`);
    expect(crossPur.status).toBe(404);
  });
});
