import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase, prisma } from '../../src/database/prisma.js';
import { cleanTestDatabase } from '../helpers/db-reset.js';

describe('Phase 8 Offline Synchronization Push & Delta Pull API', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await disconnectDatabase();
  });

  async function setupShopWithStaffAndCatalog() {
    const reg = await request(app).post('/api/v1/auth/register').send({
      shopNameBn: 'রহিম স্টোর',
      ownerName: 'আব্দুর রহিম',
      phone: '০১৭১১২২৩৩৪৪',
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
        name: 'করিম কর্মচারী',
        phone: '০১৮১১০০০০১১',
        password: 'StaffPassword123',
      });
    expect(staffRes.status).toBe(201);

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '০১৮১১০০০০১১',
      password: 'StaffPassword123',
    });
    expect(empLogin.status).toBe(200);
    const employeeToken = empLogin.body.data.tokens.accessToken as string;

    const unitsRes = await request(app)
      .get('/api/v1/units')
      .set('Authorization', `Bearer ${ownerToken}`);
    const units = unitsRes.body.data.units as { id: string; code: string }[];
    const pieceUnit = units.find((u) => u.code === 'PIECE');
    const biraUnit = units.find((u) => u.code === 'BIRA');
    if (!pieceUnit || !biraUnit) {
      throw new Error('Default units PIECE or BIRA missing in seed');
    }
    const pieceId = pieceUnit.id;
    const biraId = biraUnit.id;

    // Pan: 1 বিড়া = 20 টি @ ৳35, opening stock = 5 বিড়া (100 টি)
    const panRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'রাজশাহীর পান',
        nameEn: 'Rajshahi Pan',
        baseUnitId: pieceId,
        defaultSaleUnitId: biraId,
        defaultPurchaseUnitId: biraId,
        baseSellingPricePoisha: 200,
        lastPurchasePricePoisha: 120,
        units: [{ unitId: biraId, conversionFactorToBase: '20', sellingPricePoisha: 3500 }],
        openingStock: {
          qtyDisplay: '5',
          unitId: biraId,
          unitCostPoisha: 2500,
        },
      });
    expect(panRes.status).toBe(201);

    const supplierRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'ঢাকা মহাজন',
        phone: '০১৯১১০০০০২২',
      });
    expect(supplierRes.status).toBe(201);

    const purchaseRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', 'sync-seed-purchase-1')
      .send({
        supplierId: supplierRes.body.data.supplier.id,
        items: [
          {
            productId: panRes.body.data.product.id,
            unitId: biraId,
            qtyDisplay: '2',
            unitCostPoisha: 2600,
          },
        ],
        paidPoisha: 5200,
        paymentMethod: 'CASH',
      });
    expect(purchaseRes.status).toBe(201);

    return {
      ownerToken,
      employeeToken,
      shopId,
      pieceId,
      biraId,
      productId: panRes.body.data.product.id as string,
      supplierId: supplierRes.body.data.supplier.id as string,
    };
  }

  it('paginates monotonic syncSeq deltas on pull, respects EMPLOYEE RBAC, and emits DELETE on archive', async () => {
    const { ownerToken, employeeToken, productId, supplierId } =
      await setupShopWithStaffAndCatalog();

    // Paginate with small limit
    const page1 = await request(app)
      .get('/api/v1/sync/pull?cursor=0&limit=3')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.hasMore).toBe(true);
    expect(page1.body.data.nextCursor).toBeGreaterThan(0);

    const page2 = await request(app)
      .get(`/api/v1/sync/pull?cursor=${page1.body.data.nextCursor}&limit=200`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data.nextCursor).toBeGreaterThanOrEqual(page1.body.data.nextCursor);

    // Owner full pull includes SUPPLIER & PURCHASE
    const ownerAll = await request(app)
      .get('/api/v1/sync/pull?cursor=0&limit=200')
      .set('Authorization', `Bearer ${ownerToken}`);
    const ownerTypes = new Set(
      (ownerAll.body.data.changes as Array<{ entityType: string }>).map((c) => c.entityType),
    );
    expect(ownerTypes.has('PRODUCT')).toBe(true);
    expect(ownerTypes.has('SUPPLIER')).toBe(true);
    expect(ownerTypes.has('PURCHASE')).toBe(true);

    // Employee pull MUST NOT include SUPPLIER or PURCHASE and hides cost/profit fields on PRODUCT
    const empAll = await request(app)
      .get('/api/v1/sync/pull?cursor=0&limit=200')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empAll.status).toBe(200);
    const empChanges = empAll.body.data.changes as Array<{
      entityType: string;
      entityId: string;
      payload: Record<string, unknown> | null;
    }>;
    expect(empChanges.some((c) => c.entityType === 'SUPPLIER')).toBe(false);
    expect(empChanges.some((c) => c.entityType === 'PURCHASE')).toBe(false);
    const empProd = empChanges.find((c) => c.entityType === 'PRODUCT' && c.entityId === productId);
    expect(empProd?.payload?.lastPurchasePricePoisha).toBeNull();
    expect(
      (empProd?.payload?.inventory as Record<string, unknown> | undefined)?.avgCostPerBaseBdt,
    ).toBeNull();

    // Archive product -> incremental pull returns DELETE action
    const prevCursor = ownerAll.body.data.nextCursor as number;
    const delRes = await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(delRes.status).toBe(200);

    const deltaAfterDelete = await request(app)
      .get(`/api/v1/sync/pull?cursor=${prevCursor}&limit=50`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deltaAfterDelete.status).toBe(200);
    const deletedChange = (
      deltaAfterDelete.body.data.changes as Array<{
        entityType: string;
        entityId: string;
        action: string;
      }>
    ).find((c) => c.entityType === 'PRODUCT' && c.entityId === productId);
    expect(deletedChange?.action).toBe('DELETE');
    expect(supplierId).toBeTruthy();
  });

  it('pushes causal offline chain (Customer -> Credit Sale -> Due Collection) and replays idempotently without duplication', async () => {
    const { ownerToken, shopId, biraId, productId } = await setupShopWithStaffAndCatalog();

    const customerId = crypto.randomUUID();
    const saleId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();

    const opCustId = crypto.randomUUID();
    const opSaleId = crypto.randomUUID();
    const opPayId = crypto.randomUUID();

    const pushPayload = {
      deviceId: 'device-offline-pos-1',
      operations: [
        {
          clientOpId: opCustId,
          idempotencyKey: 'idem-cust-1',
          opType: 'CREATE_CUSTOMER',
          entityType: 'CUSTOMER',
          entityId: customerId,
          occurredAt: '2026-11-12T06:00:00+06:00',
          payload: {
            nameBn: 'অফলাইন ক্রেতা জব্বার',
            phone: '০১৭৮৮৯৯০০১১',
          },
        },
        {
          clientOpId: opSaleId,
          idempotencyKey: 'idem-sale-1',
          opType: 'CREATE_SALE',
          entityType: 'SALE',
          entityId: saleId,
          dependsOnEntityId: customerId,
          occurredAt: '2026-11-12T06:05:00+06:00',
          payload: {
            customerId,
            items: [{ productId, unitId: biraId, qtyDisplay: '2' }], // 2 বিড়া * ৳35 = 7000 poisha
            payments: [{ method: 'CASH', amountPoisha: 2000 }], // Due = 5000 poisha
            tenderedPoisha: 2000,
          },
        },
        {
          clientOpId: opPayId,
          idempotencyKey: 'idem-pay-1',
          opType: 'COLLECT_CUSTOMER_PAYMENT',
          entityType: 'CUSTOMER',
          entityId: paymentId,
          dependsOnEntityId: customerId,
          occurredAt: '2026-11-12T06:10:00+06:00',
          payload: {
            customerId,
            method: 'BKASH',
            amountPoisha: 1500, // Remaining due = 3500 poisha
            reference: 'TRX-OFFLINE-1',
            paidAt: '2026-11-12T06:10:00+06:00',
          },
        },
      ],
    };

    const pushRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(pushPayload);
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.data.results).toHaveLength(3);
    expect(pushRes.body.data.results.every((r: { status: string }) => r.status === 'SYNCED')).toBe(
      true,
    );
    expect(pushRes.body.data.results[0].replayed).toBe(false);

    // Check customer due is 3500 poisha & stock dropped by 40 টি (140 - 40 = 100 টি)
    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(cust.duePoisha).toBe(3500);
    const inv = await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId } });
    expect(inv.qtyBase.toFixed(0)).toBe('100');

    // Simulate dropped network ACK: replay exact same batch
    const replayRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(pushPayload);
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.data.results.every((r: { replayed: boolean }) => r.replayed === true)).toBe(
      true,
    );

    // Zero duplicate sales or double stock deduction
    const salesCount = await prisma.sale.count({ where: { shopId } });
    expect(salesCount).toBe(1);
    const invAfterReplay = await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId } });
    expect(invAfterReplay.qtyBase.toFixed(0)).toBe('100');
  });

  it('preserves offline prices with variance warning and allows offline sales of subsequently archived products with AuditLog', async () => {
    const { ownerToken, shopId, biraId, productId } = await setupShopWithStaffAndCatalog();

    // Online owner changes price 3500 -> 4500 then archives the product
    const prodRes = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const version = prodRes.body.data.product.version as number;

    await request(app)
      .put(`/api/v1/products/${productId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        units: [{ unitId: biraId, conversionFactorToBase: '20', sellingPricePoisha: 4500 }],
      });
    await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ expectedVersion: version, nameBn: 'আর্কাইভ হওয়া পান' });
    await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const saleId = crypto.randomUUID();
    const pushRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        operations: [
          {
            clientOpId: crypto.randomUUID(),
            idempotencyKey: 'idem-archived-price-sale',
            opType: 'CREATE_SALE',
            entityType: 'SALE',
            entityId: saleId,
            occurredAt: '2026-11-12T07:00:00+06:00',
            payload: {
              items: [{ productId, unitId: biraId, qtyDisplay: '1' }],
              payments: [{ method: 'CASH', amountPoisha: 3500 }],
              offlineItemPrices: [3500],
            },
          },
        ],
      });

    expect(pushRes.status).toBe(200);
    const resItem = pushRes.body.data.results[0];
    expect(resItem.status).toBe('SYNCED');
    expect(resItem.appliedEntity.totalPoisha).toBe(3500);
    expect(resItem.warnings).toContain('OFFLINE_PRICE_VARIANCE');
    expect(resItem.warnings).toContain('ARCHIVED_PRODUCT_SOLD');

    const audit = await prisma.auditLog.findFirst({
      where: { shopId, entityId: saleId, action: 'ARCHIVED_PRODUCT_SOLD' },
    });
    expect(audit).not.toBeNull();
  });

  it('detects VERSION_CONFLICT and INSUFFICIENT_STOCK without silent overwrite and resolves on retry', async () => {
    const { ownerToken, employeeToken, biraId, productId } =
      await setupShopWithStaffAndCatalog();

    const initialProd = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const initialVersion = initialProd.version;
    const bumpedVersion = initialVersion + 1;

    // 1. Version conflict on UPDATE_PRODUCT (server bumps version, offline pushes stale baseVersion)
    const serverEdit = await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: 'সার্ভারের নতুন নাম',
        baseSellingPricePoisha: 250,
        expectedVersion: initialVersion,
      });
    expect(serverEdit.status).toBe(200);
    expect(serverEdit.body.data.product.version).toBe(bumpedVersion);

    const conflictPush = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        operations: [
          {
            clientOpId: crypto.randomUUID(),
            idempotencyKey: 'idem-prod-edit-stale',
            opType: 'UPDATE_PRODUCT',
            entityType: 'PRODUCT',
            entityId: productId,
            baseVersion: initialVersion,
            payload: {
              nameBn: 'অফলাইনের নাম',
              baseSellingPricePoisha: 210,
              expectedVersion: initialVersion,
            },
          },
        ],
      });

    expect(conflictPush.status).toBe(200);
    const conflictItem = conflictPush.body.data.results[0];
    expect(conflictItem.status).toBe('CONFLICT');
    expect(conflictItem.conflictKind).toBe('VERSION_CONFLICT');
    expect(conflictItem.serverVersion).toBe(bumpedVersion);
    expect(conflictItem.serverSnapshot.nameBn).toBe('সার্ভারের নতুন নাম');

    // Verify server DB was NOT silently overwritten
    const prodBeforeResolve = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(prodBeforeResolve.nameBn).toBe('সার্ভারের নতুন নাম');

    // Resolve "Keep Mine" using bumpedVersion and new idempotencyKey
    const resolvedPush = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        operations: [
          {
            clientOpId: crypto.randomUUID(),
            idempotencyKey: 'idem-prod-edit-resolved',
            opType: 'UPDATE_PRODUCT',
            entityType: 'PRODUCT',
            entityId: productId,
            baseVersion: bumpedVersion,
            payload: {
              nameBn: 'অফলাইনের নাম',
              baseSellingPricePoisha: 210,
              expectedVersion: bumpedVersion,
            },
          },
        ],
      });
    expect(resolvedPush.status).toBe(200);
    expect(resolvedPush.body.data.results[0].status).toBe('SYNCED');
    expect(resolvedPush.body.data.results[0].appliedEntity.nameBn).toBe('অফলাইনের নাম');

    // 2. Insufficient stock on CREATE_SALE (stock=7 বিড়া = 140 টি, offline sells 20 বিড়া = 400 টি)
    const oversellSaleId = crypto.randomUUID();
    const empOversell = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        operations: [
          {
            clientOpId: crypto.randomUUID(),
            idempotencyKey: 'idem-oversell-emp',
            opType: 'CREATE_SALE',
            entityType: 'SALE',
            entityId: oversellSaleId,
            payload: {
              items: [{ productId, unitId: biraId, qtyDisplay: '20' }],
              payments: [{ method: 'CASH', amountPoisha: 70000 }],
              forceAllowNegativeStock: true, // EMPLOYEE cannot bypass!
            },
          },
        ],
      });
    expect(empOversell.status).toBe(200);
    expect(empOversell.body.data.results[0].status).toBe('CONFLICT');
    expect(empOversell.body.data.results[0].conflictKind).toBe('INSUFFICIENT_STOCK');

    // Owner overrides negative stock -> succeeds with LOW_STOCK_DISCREPANCY
    const ownerOverride = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        operations: [
          {
            clientOpId: crypto.randomUUID(),
            idempotencyKey: 'idem-oversell-owner-override',
            opType: 'CREATE_SALE',
            entityType: 'SALE',
            entityId: oversellSaleId,
            payload: {
              items: [{ productId, unitId: biraId, qtyDisplay: '20' }],
              payments: [{ method: 'CASH', amountPoisha: 70000 }],
              forceAllowNegativeStock: true,
            },
          },
        ],
      });
    expect(ownerOverride.status).toBe(200);
    expect(ownerOverride.body.data.results[0].status).toBe('SYNCED');
    expect(ownerOverride.body.data.results[0].warnings).toContain('LOW_STOCK_DISCREPANCY');

    const invNeg = await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId } });
    expect(Number(invNeg.qtyBase)).toBeLessThan(0);
  });
});
