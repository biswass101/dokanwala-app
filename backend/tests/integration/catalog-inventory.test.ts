import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase } from '../../src/database/prisma.js';
import { cleanTestDatabase } from '../helpers/db-reset.js';

describe('Phase 3 Products, Flexible Units & Inventory Management API', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await disconnectDatabase();
  });

  async function setupShopWithOwner(phone = '০১৭১১২২৩৩৪৪', shopNameBn = 'রহিম পান ও মুদি স্টোর') {
    const res = await request(app).post('/api/v1/auth/register').send({
      shopNameBn,
      ownerName: 'আব্দুর রহিম',
      phone,
      password: 'StrongPassword123',
      preferredLanguage: 'bn',
      preferredDigitStyle: 'bn',
    });

    expect(res.status).toBe(201);
    return {
      accessToken: res.body.data.tokens.accessToken as string,
      shopId: res.body.data.shop.id as string,
    };
  }

  async function findDefaultUnitsMap(token: string) {
    const res = await request(app)
      .get('/api/v1/units')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const units = res.body.data.units as Array<{ id: string; code: string; nameBn: string }>;
    const map = new Map<string, string>();
    for (const u of units) {
      map.set(u.code, u.id);
    }
    return { map, units };
  }

  function requireUnitId(map: Map<string, string>, code: string): string {
    const id = map.get(code);
    if (!id) {
      throw new Error(`Missing unit code: ${code}`);
    }
    return id;
  }

  it('seeds Bangladeshi default categories/units and manages custom catalog items', async () => {
    const { accessToken } = await setupShopWithOwner();

    const catsRes = await request(app)
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(catsRes.status).toBe(200);
    const categories = catsRes.body.data.categories as Array<{ id: string; nameBn: string }>;
    expect(categories.some((c) => c.nameBn === 'পান ও সুপারি')).toBe(true);
    expect(categories.some((c) => c.nameBn === 'জর্দা ও পান মশলা')).toBe(true);

    const { map: unitMap, units } = await findDefaultUnitsMap(accessToken);
    expect(units.some((u) => u.code === 'BIRA' && u.nameBn === 'বিড়া')).toBe(true);
    expect(units.some((u) => u.code === 'POYA' && u.nameBn === 'পোয়া')).toBe(true);

    const createCat = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameBn: 'সিজনাল ফল', nameEn: 'Seasonal Fruits', sortOrder: 90 });
    expect(createCat.status).toBe(201);

    const dupCat = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameBn: 'সিজনাল ফল' });
    expect(dupCat.status).toBe(409);

    const createUnit = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: 'pon', nameBn: 'পণ', nameEn: 'Pon (80 pieces)', isFractional: false });
    expect(createUnit.status).toBe(201);
    expect(createUnit.body.data.unit.code).toBe('PON');

    const delCat = await request(app)
      .delete(`/api/v1/categories/${createCat.body.data.category.id as string}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(delCat.status).toBe(200);

    // Optional fields explicitly sent as null (e.g. nameEn, defaultSupplierName) must succeed
    const nullOptionalProd = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameBn: 'সাদাপাতা',
        nameEn: null,
        categoryId: null,
        defaultSupplierName: null,
        baseUnitId: requireUnitId(unitMap, 'PIECE'),
        baseSellingPricePoisha: 500,
      });
    expect(nullOptionalProd.status).toBe(201);
    expect(nullOptionalProd.body.data.product.nameEn).toBeNull();
    expect(nullOptionalProd.body.data.product.defaultSupplierName).toBeNull();
  });

  it('creates Pan & Supari products with flexible unit conversions, Bangla digits, NFC search & low-stock alerts', async () => {
    const { accessToken } = await setupShopWithOwner();
    const { map: units } = await findDefaultUnitsMap(accessToken);

    const pieceId = requireUnitId(units, 'PIECE');
    const biraId = requireUnitId(units, 'BIRA');
    const gramId = requireUnitId(units, 'GRAM');
    const kgId = requireUnitId(units, 'KG');
    const poyaId = requireUnitId(units, 'POYA');

    const catsRes = await request(app)
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`);
    const panCat = (catsRes.body.data.categories as Array<{ id: string; nameBn: string }>).find(
      (c) => c.nameBn === 'পান ও সুপারি',
    );
    if (!panCat) throw new Error('Missing Pan category');

    // 1. Create Pan (পান): 1 বিড়া = 20 টি, opening 10 বিড়া @ 25 BDT/বিড়া (2500 poisha)
    const panRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameBn: 'রাজশাহীর পান',
        nameEn: 'Rajshahi Pan',
        categoryId: panCat.id,
        barcode: 'PAN-001',
        defaultSupplierName: 'করিম পাইকার',
        baseUnitId: pieceId,
        defaultSaleUnitId: biraId,
        defaultPurchaseUnitId: biraId,
        baseSellingPricePoisha: 200,
        lastPurchasePricePoisha: 125,
        lowStockThresholdBase: '50',
        units: [
          {
            unitId: biraId,
            conversionFactorToBase: '২০',
            sellingPricePoisha: 3500,
          },
        ],
        openingStock: {
          qtyDisplay: '১০',
          unitId: biraId,
          unitCostPoisha: 2500,
          reason: 'শুরুর মজুত',
        },
      });

    expect(panRes.status).toBe(201);
    expect(panRes.body.data.product.inventory).toMatchObject({
      qtyBase: '200.0000',
      avgCostPerBaseBdt: '1.250000',
      valuationPoisha: 25000,
    });
    expect(panRes.body.data.product.isLowStock).toBe(false);

    // 2. Create Supari (সুপারি): base=GRAM, poya=250g, kg=1000g, opening 2.5 kg @ 400 BDT/kg -> 2500g @ 0.40/g (100000 poisha)
    const supariRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameBn: 'খুলনার শুকনা সুপারি',
        nameEn: 'Khulna Dried Supari',
        categoryId: panCat.id,
        baseUnitId: gramId,
        defaultSaleUnitId: poyaId,
        defaultPurchaseUnitId: kgId,
        baseSellingPricePoisha: 120,
        lastPurchasePricePoisha: 40,
        lowStockThresholdBase: '3000', // 3kg threshold > 2.5kg opening -> low stock!
        units: [
          { unitId: poyaId, conversionFactorToBase: '250', sellingPricePoisha: 27500 },
          { unitId: kgId, conversionFactorToBase: '1000', sellingPricePoisha: 110000 },
        ],
        openingStock: {
          qtyDisplay: '২.৫',
          unitId: kgId,
          unitCostPoisha: 40000,
        },
      });

    expect(supariRes.status).toBe(201);
    expect(supariRes.body.data.product.inventory).toMatchObject({
      qtyBase: '2500.0000',
      avgCostPerBaseBdt: '0.400000',
      valuationPoisha: 100000,
    });
    expect(supariRes.body.data.product.isLowStock).toBe(true);

    // Bilingual search (English substring, Bangla NFC, barcode)
    const searchEn = await request(app)
      .get('/api/v1/products?q=Rajshahi')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(searchEn.status).toBe(200);
    expect(searchEn.body.data.products).toHaveLength(1);

    const searchBarcode = await request(app)
      .get('/api/v1/products?q=PAN-001')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(searchBarcode.status).toBe(200);
    expect(searchBarcode.body.data.products[0].id).toBe(panRes.body.data.product.id);

    // Low-stock filter & alerts
    const alertsRes = await request(app)
      .get('/api/v1/inventory/alerts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body.data.products).toHaveLength(1);
    expect(alertsRes.body.data.products[0].id).toBe(supariRes.body.data.product.id);

    // Valuation summary
    const valRes = await request(app)
      .get('/api/v1/inventory/valuation')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(valRes.status).toBe(200);
    expect(valRes.body.data.valuation).toMatchObject({
      totalValuationPoisha: 125000,
      totalActiveProducts: 2,
      lowStockCount: 1,
      outOfStockCount: 0,
    });
  });

  it('records wastage & count adjustments idempotently, preserves history on archive, and blocks invalid stock/unit edits', async () => {
    const { accessToken } = await setupShopWithOwner();
    const { map: units } = await findDefaultUnitsMap(accessToken);

    const pieceId = requireUnitId(units, 'PIECE');
    const biraId = requireUnitId(units, 'BIRA');
    const gramId = requireUnitId(units, 'GRAM');

    const panRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameBn: 'টাটকা পান',
        baseUnitId: pieceId,
        defaultSaleUnitId: pieceId,
        defaultPurchaseUnitId: biraId,
        baseSellingPricePoisha: 200,
        units: [{ unitId: biraId, conversionFactorToBase: '20', sellingPricePoisha: 3500 }],
        openingStock: {
          qtyDisplay: '10',
          unitId: biraId,
          unitCostPoisha: 2500, // 200 pieces @ 1.25/piece = 25000 poisha
        },
      });
    expect(panRes.status).toBe(201);
    const panId = panRes.body.data.product.id as string;

    // Base unit is immutable once stock movements exist
    const changeBaseRes = await request(app)
      .patch(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ baseUnitId: gramId });
    expect(changeBaseRes.status).toBe(422);
    expect(changeBaseRes.body.error.code).toBe('BUSINESS_RULE_VIOLATION');

    // Optimistic version mismatch check
    const stalePatch = await request(app)
      .patch(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ baseSellingPricePoisha: 250, expectedVersion: 99 });
    expect(stalePatch.status).toBe(409);
    expect(stalePatch.body.error.code).toBe('VERSION_CONFLICT');

    // Record wastage of 1 বিড়া (20 pieces) with idempotency key -> loss = 2500 poisha (25 BDT)
    const idemKey = '11111111-1111-4111-8111-111111111111';
    const waste1 = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Idempotency-Key', idemKey)
      .send({
        productId: panId,
        adjustmentType: 'WASTAGE',
        unitId: biraId,
        qtyDisplay: '১',
        reason: 'গরমে ১ বিড়া পান পচে গেছে',
      });

    expect(waste1.status).toBe(201);
    expect(waste1.body.data.idempotencyReplayed).toBe(false);
    expect(waste1.body.data.adjustment).toMatchObject({
      adjustmentType: 'WASTAGE',
      qtyBase: '20.0000',
      deltaQtyBase: '-20.0000',
      lossPoisha: 2500,
    });
    expect(waste1.body.data.product.inventory.qtyBase).toBe('180.0000');

    // Duplicate retry with same idempotency key does NOT deduct stock again
    const wasteRetry = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Idempotency-Key', idemKey)
      .send({
        productId: panId,
        adjustmentType: 'WASTAGE',
        unitId: biraId,
        qtyDisplay: '১',
      });

    expect(wasteRetry.status).toBe(200);
    expect(wasteRetry.body.data.idempotencyReplayed).toBe(true);
    expect(wasteRetry.body.data.product.inventory.qtyBase).toBe('180.0000');

    // Excessive wastage exceeding remaining 180 pieces fails cleanly (allowNegativeStock=false)
    const tooMuchWaste = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: panId,
        adjustmentType: 'DAMAGE',
        unitId: biraId,
        qtyDisplay: '15', // 300 > 180
      });
    expect(tooMuchWaste.status).toBe(409);
    expect(tooMuchWaste.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Physical stock count via countedQtyDisplay (180 -> 175 = -5 delta = 625 poisha loss)
    const countAdj = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: panId,
        adjustmentType: 'COUNT_ADJUST',
        unitId: pieceId,
        countedQtyDisplay: '175',
        reason: 'সন্ধ্যায় হাতে গোনা হিসাব',
      });
    expect(countAdj.status).toBe(201);
    expect(countAdj.body.data.adjustment).toMatchObject({
      deltaQtyBase: '-5.0000',
      lossPoisha: 625,
    });
    expect(countAdj.body.data.product.inventory.qtyBase).toBe('175.0000');

    // Archive product -> excluded from active catalog, movements still preserved
    const archiveRes = await request(app)
      .delete(`/api/v1/products/${panId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(archiveRes.status).toBe(200);

    const activeList = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(activeList.body.data.products).toHaveLength(0);

    const movementsRes = await request(app)
      .get(`/api/v1/inventory/movements?productId=${panId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(movementsRes.status).toBe(200);
    expect(movementsRes.body.data.movements).toHaveLength(3);
  });

  it('enforces OWNER/EMPLOYEE RBAC cost hiding and cross-shop tenant isolation', async () => {
    const ownerA = await setupShopWithOwner('০১৭১১২২৩৩৪৪', 'দোকান এ');
    const ownerB = await setupShopWithOwner('০১৮১১২২৩৩৫৫', 'দোকান বি');

    const { map: unitsA } = await findDefaultUnitsMap(ownerA.accessToken);
    const packetId = requireUnitId(unitsA, 'PACKET');

    // Create Employee in Shop A
    const createEmpRes = await request(app)
      .post('/api/v1/shop/users')
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .send({
        name: 'কর্মচারী হাসান',
        phone: '01911223366',
        password: 'EmpPassword123',
      });
    expect(createEmpRes.status).toBe(201);

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01911223366',
      password: 'EmpPassword123',
    });
    expect(empLogin.status).toBe(200);
    const empToken = empLogin.body.data.tokens.accessToken as string;

    // Owner A creates Jorda product with cost info
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .send({
        nameBn: 'হাকিমপুরী জর্দা',
        baseUnitId: packetId,
        baseSellingPricePoisha: 3000,
        lastPurchasePricePoisha: 2200,
        openingStock: {
          qtyDisplay: '20',
          unitId: packetId,
          unitCostPoisha: 2200,
        },
      });
    expect(prodRes.status).toBe(201);
    const prodId = prodRes.body.data.product.id as string;

    // Employee can browse products & movements, but wholesale cost fields are hidden (`null`)
    const empList = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${empToken}`);
    expect(empList.status).toBe(200);
    expect(empList.body.data.products[0]).toMatchObject({
      nameBn: 'হাকিমপুরী জর্দা',
      baseSellingPricePoisha: 3000,
      lastPurchasePricePoisha: null,
      inventory: {
        qtyBase: '20.0000',
        avgCostPerBaseBdt: null,
        valuationPoisha: null,
      },
    });

    const empMovements = await request(app)
      .get('/api/v1/inventory/movements')
      .set('Authorization', `Bearer ${empToken}`);
    expect(empMovements.status).toBe(200);
    expect(empMovements.body.data.movements[0].unitCostBdt).toBeNull();
    expect(empMovements.body.data.movements[0].valuePoisha).toBeNull();

    // Employee blocked from Owner-only endpoints
    const empVal = await request(app)
      .get('/api/v1/inventory/valuation')
      .set('Authorization', `Bearer ${empToken}`);
    expect(empVal.status).toBe(403);

    const empWaste = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        productId: prodId,
        adjustmentType: 'WASTAGE',
        unitId: packetId,
        qtyDisplay: '1',
      });
    expect(empWaste.status).toBe(403);

    const empCreateProd = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        nameBn: 'অনুমতি ছাড়া পণ্য',
        baseUnitId: packetId,
        baseSellingPricePoisha: 100,
      });
    expect(empCreateProd.status).toBe(403);

    // Shop B cannot access or mutate Shop A product
    const shopBRead = await request(app)
      .get(`/api/v1/products/${prodId}`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`);
    expect(shopBRead.status).toBe(404);

    const shopBMutate = await request(app)
      .patch(`/api/v1/products/${prodId}`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ baseSellingPricePoisha: 500 });
    expect(shopBMutate.status).toBe(404);
  });
});
