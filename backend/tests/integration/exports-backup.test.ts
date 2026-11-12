import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { validateProductionEnv } from '../../src/config/env.js';
import { disconnectDatabase, prisma } from '../../src/database/prisma.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { cleanTestDatabase } from '../helpers/db-reset.js';

describe('Phase 9 Production Security, Exports, PDF Receipts & JSON Backup/Restore', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await disconnectDatabase();
  });

  async function seedRichShopScenario(phonePrefix = '01711') {
    const reg = await request(app).post('/api/v1/auth/register').send({
      shopNameBn: 'বিসমিল্লাহ পান ও মুদি',
      shopNameEn: 'Bismillah Pan & Grocery',
      ownerName: 'হাজী সেলিম',
      phone: `${phonePrefix}223344`,
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
        name: 'রফিক কর্মচারী',
        phone: `${phonePrefix}889900`,
        password: 'StaffPassword123',
      });
    expect(staffRes.status).toBe(201);

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      phone: `${phonePrefix}889900`,
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
      throw new Error('Expected PIECE and BIRA units in test setup');
    }
    const pieceId = pieceUnit.id;
    const biraId = biraUnit.id;

    // Product with CSV formula-like text in name to verify formula injection neutralization
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: '=CMD|calc মিষ্টি পান',
        nameEn: '=CMD|calc Sweet Pan',
        baseUnitId: pieceId,
        defaultSaleUnitId: biraId,
        defaultPurchaseUnitId: biraId,
        baseSellingPricePoisha: 200,
        lastPurchasePricePoisha: 120,
        units: [{ unitId: biraId, conversionFactorToBase: '20', sellingPricePoisha: 4000 }],
        openingStock: {
          qtyDisplay: '10',
          unitId: biraId,
          unitCostPoisha: 2400,
        },
      });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.product.id as string;

    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nameBn: '+SUM(A1) জামাল',
        phone: `${phonePrefix}556677`,
      });
    expect(custRes.status).toBe(201);
    const customerId = custRes.body.data.customer.id as string;

    // Open cashbook
    const openCash = await request(app)
      .post('/api/v1/cashbook/open')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', `open-${phonePrefix}`)
      .send({ openingCashPoisha: 100000 });
    expect(openCash.status).toBe(201);

    // Partial credit sale: 2 Bira = 8000 poisha, paid 5000, due 3000
    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Idempotency-Key', `sale-${phonePrefix}`)
      .send({
        customerId,
        items: [{ productId, unitId: biraId, qtyDisplay: '2' }],
        payments: [{ method: 'CASH', amountPoisha: 5000 }],
      });
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.data.sale.id as string;

    return {
      ownerToken,
      employeeToken,
      shopId,
      productId,
      customerId,
      saleId,
    };
  }

  it('exports UTF-8 BOM CSV with formula neutralization and enforces EMPLOYEE RBAC', async () => {
    const { ownerToken, employeeToken } = await seedRichShopScenario('01712');

    // 1. Owner sales CSV
    const ownerSalesCsv = await request(app)
      .get('/api/v1/reports/export?report=sales&format=csv&lang=bn')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerSalesCsv.status).toBe(200);
    expect(ownerSalesCsv.headers['content-type']).toContain('text/csv');
    expect(ownerSalesCsv.headers['content-disposition']).toContain('dokanwala-sales-');
    expect(ownerSalesCsv.text.startsWith('\uFEFF')).toBe(true);
    expect(ownerSalesCsv.text).toContain('নিট বিক্রি (টাকা)');
    expect(ownerSalesCsv.text).toContain('মোট লাভ (টাকা)');

    // 2. Employee sales CSV omits COGS/Gross Profit columns
    const empSalesCsv = await request(app)
      .get('/api/v1/reports/export?report=sales&format=csv&lang=bn')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empSalesCsv.status).toBe(200);
    expect(empSalesCsv.text).toContain('নিট বিক্রি (টাকা)');
    expect(empSalesCsv.text).not.toContain('COGS');
    expect(empSalesCsv.text).not.toContain('মোট লাভ');

    // 3. Employee blocked from profit-loss CSV
    const empPnlCsv = await request(app)
      .get('/api/v1/reports/export?report=profit-loss&format=csv&lang=bn')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empPnlCsv.status).toBe(403);
    expect(empPnlCsv.body.error.code).toBe('FORBIDDEN_ROLE');

    // 4. Formula injection neutralized in products & dues CSV
    const productsCsv = await request(app)
      .get('/api/v1/reports/export?report=products&format=csv&lang=bn')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(productsCsv.status).toBe(200);
    expect(productsCsv.text).toContain("'=CMD|calc মিষ্টি পান");

    const duesCsv = await request(app)
      .get('/api/v1/reports/export?report=dues&format=csv&lang=bn')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(duesCsv.status).toBe(200);
    expect(duesCsv.text).toContain("'+SUM(A1) জামাল");
  });

  it('generates embedded Noto Sans Bengali PDFs for P&L reports and POS receipts with tenant isolation', async () => {
    const { ownerToken, employeeToken, saleId } = await seedRichShopScenario('01713');

    // 1. P&L PDF export (binary Buffer)
    const pnlPdf = await request(app)
      .get('/api/v1/reports/export?report=profit-loss&format=pdf&lang=bn')
      .set('Authorization', `Bearer ${ownerToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pnlPdf.status).toBe(200);
    expect(pnlPdf.headers['content-type']).toBe('application/pdf');
    const pnlBuf = pnlPdf.body as Buffer;
    expect(pnlBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pnlBuf.toString('latin1')).toContain('NotoSansBengali');

    // 2. Receipt PDF (accessible by employee of same shop)
    const receiptPdf = await request(app)
      .get(`/api/v1/sales/${saleId}/receipt/pdf?lang=bn`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(receiptPdf.status).toBe(200);
    expect(receiptPdf.headers['content-type']).toBe('application/pdf');
    expect(receiptPdf.headers['content-disposition']).toContain('receipt-');
    const receiptBuf = receiptPdf.body as Buffer;
    expect(receiptBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(receiptBuf.toString('latin1')).toContain('NotoSansBengali');

    // 3. Cross-shop receipt PDF returns 404
    const otherShop = await request(app).post('/api/v1/auth/register').send({
      shopNameBn: 'অন্য দোকান',
      ownerName: 'অন্য মালিক',
      phone: '01799001122',
      password: 'StrongPassword123',
    });
    const otherToken = otherShop.body.data.tokens.accessToken as string;
    const crossShopPdf = await request(app)
      .get(`/api/v1/sales/${saleId}/receipt/pdf?lang=bn`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(crossShopPdf.status).toBe(404);
  });

  it('enforces OWNER RBAC, verifies SHA-256 integrity, preserves staff logins, and restores atomically across shops', async () => {
    const shopA = await seedRichShopScenario('01714');

    // 1. Employee blocked from export/restore
    const empExport = await request(app)
      .get('/api/v1/backup/export')
      .set('Authorization', `Bearer ${shopA.employeeToken}`);
    expect(empExport.status).toBe(403);

    // 2. Owner exports backup JSON
    const exportRes = await request(app)
      .get('/api/v1/backup/export')
      .set('Authorization', `Bearer ${shopA.ownerToken}`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-disposition']).toContain('dokanwala-backup-');
    expect(exportRes.text).not.toContain('passwordHash');
    expect(exportRes.text).not.toContain('pinHash');
    const backupDoc = JSON.parse(exportRes.text) as {
      schemaVersion: number;
      sourceShopId: string;
      checksumSha256: string;
      exportedAt: string;
      data: {
        products: { nameBn: string }[];
        customers: { duePoisha: number }[];
        sales: { totalPoisha: number }[];
      };
    };
    expect(backupDoc.schemaVersion).toBe(1);
    expect(backupDoc.data.products).toHaveLength(1);
    expect(backupDoc.data.customers[0]?.duePoisha).toBe(3000);
    expect(backupDoc.data.sales[0]?.totalPoisha).toBe(8000);

    // 3. Tampered payload fails SHA-256 validation without mutating DB
    const tampered = structuredClone(backupDoc);
    const firstCustomer = tampered.data.customers[0];
    if (!firstCustomer) {
      throw new Error('Expected customer in exported backup');
    }
    firstCustomer.duePoisha = 999999;
    const tamperRes = await request(app)
      .post('/api/v1/backup/restore')
      .set('Authorization', `Bearer ${shopA.ownerToken}`)
      .send(tampered);
    expect(tamperRes.status).toBe(400);
    expect(tamperRes.body.error.message).toContain('checksum');

    // 4. Register fresh Shop B and restore Shop A's backup into Shop B (cross-shop safe remap)
    const regB = await request(app).post('/api/v1/auth/register').send({
      shopNameBn: 'দোকান বি',
      ownerName: 'মালিক বি',
      phone: '01755667788',
      password: 'StrongPassword123',
    });
    expect(regB.status).toBe(201);
    const ownerBToken = regB.body.data.tokens.accessToken as string;
    const shopBId = regB.body.data.shop.id as string;

    const restoreBRes = await request(app)
      .post('/api/v1/backup/restore')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send(backupDoc);
    expect(restoreBRes.status).toBe(200);
    expect(restoreBRes.body.data.restore.targetShopId).toBe(shopBId);
    expect(restoreBRes.body.data.restore.counts.products).toBe(1);
    expect(restoreBRes.body.data.restore.counts.sales).toBe(1);
    expect(restoreBRes.body.data.restore.counts.customers).toBe(1);

    // Verify Shop B now has the restored customer due balance and Shop A is completely untouched
    const shopACust = await prisma.customer.findUnique({ where: { id: shopA.customerId } });
    expect(shopACust?.duePoisha).toBe(3000);

    const shopBDuesRes = await request(app)
      .get('/api/v1/reports/dues')
      .set('Authorization', `Bearer ${ownerBToken}`);
    expect(shopBDuesRes.status).toBe(200);
    expect(shopBDuesRes.body.data.report.totalCustomerDuePoisha).toBe(3000);

    // Verify Shop A employee login STILL works after backup/restore
    const empStillLogsIn = await request(app).post('/api/v1/auth/login').send({
      phone: '01714889900',
      password: 'StaffPassword123',
    });
    expect(empStillLogsIn.status).toBe(200);
  });

  it('validates production env configuration and sanitizes Prisma constraint errors cleanly', () => {
    expect(() =>
      validateProductionEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'replace-with-a-random-minimum-32-character-secret-key',
        corsOriginList: ['https://app.dokanwala.com'],
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);

    expect(() =>
      validateProductionEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a-very-strong-random-production-secret-key-with-high-entropy',
        corsOriginList: [],
      }),
    ).toThrow(/CORS_ORIGINS/);

    expect(() =>
      validateProductionEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a-very-strong-random-production-secret-key-with-high-entropy',
        corsOriginList: ['https://app.dokanwala.com'],
      }),
    ).not.toThrow();

    // Error handler sanitizes Prisma P2002 without exposing schema metadata
    const prismaErr = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`phone`)',
      { code: 'P2002', clientVersion: '7.10.1' },
    );
    let capturedStatus = 0;
    let capturedBody: { success?: boolean; error?: { code?: string; message?: string } } = {};
    const mockReq = { requestId: 'req-sec-1' } as unknown as Parameters<typeof errorHandler>[1];
    const mockRes = {
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(body: typeof capturedBody) {
        capturedBody = body;
      },
    } as unknown as Parameters<typeof errorHandler>[2];

    errorHandler(prismaErr, mockReq, mockRes, () => undefined);
    expect(capturedStatus).toBe(409);
    expect(capturedBody.error?.code).toBe('DUPLICATE_RESOURCE');
    expect(capturedBody.error?.message).not.toContain('phone');
  });
});
