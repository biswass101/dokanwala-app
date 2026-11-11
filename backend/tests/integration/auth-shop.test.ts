import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase, prisma } from '../../src/database/prisma.js';

describe('Phase 2 Auth, Security & Shop Setup API', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.refreshSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.shop.deleteMany();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.refreshSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.shop.deleteMany();
    await disconnectDatabase();
  });

  async function registerOwner(phone = '০১৭১১২২৩৩৪৪', shopNameBn = 'রহিম পান স্টোর') {
    return request(app).post('/api/v1/auth/register').send({
      shopNameBn,
      shopNameEn: 'Rahim Pan Store',
      shopAddressBn: 'চকবাজার, ঢাকা',
      ownerName: 'আব্দুর রহিম',
      phone,
      password: 'StrongPassword123',
      pin: '১২৩৪',
      preferredLanguage: 'bn',
      preferredDigitStyle: 'bn',
      deviceName: 'Xiaomi Redmi',
    });
  }

  it('registers shop and owner with Bangla inputs without leaking hashes', async () => {
    const res = await registerOwner();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      name: 'আব্দুর রহিম',
      phone: '+8801711223344',
      role: 'OWNER',
      hasPin: true,
      preferredLanguage: 'bn',
    });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.pinHash).toBeUndefined();
    expect(res.body.data.shop).toMatchObject({
      nameBn: 'রহিম পান স্টোর',
      currencyCode: 'BDT',
      timezone: 'Asia/Dhaka',
    });
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
  });

  it('prevents mass assignment via strict Zod schemas', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      shopNameBn: 'টেস্ট দোকান',
      ownerName: 'মালিক',
      phone: '01711223355',
      password: 'StrongPassword123',
      role: 'EMPLOYEE',
      isActive: false,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('supports password login, PIN login, and locks account after 5 failed attempts', async () => {
    await registerOwner();

    const pinOk = await request(app).post('/api/v1/auth/pin-login').send({
      phone: '01711223344',
      pin: '1234',
    });
    expect(pinOk.status).toBe(200);
    expect(pinOk.body.data.user.phone).toBe('+8801711223344');

    for (let i = 0; i < 4; i += 1) {
      const fail = await request(app).post('/api/v1/auth/pin-login').send({
        phone: '01711223344',
        pin: '9999',
      });
      expect(fail.status).toBe(401);
      expect(fail.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    const fifthFail = await request(app).post('/api/v1/auth/pin-login').send({
      phone: '01711223344',
      pin: '9999',
    });
    expect(fifthFail.status).toBe(403);
    expect(fifthFail.body.error.code).toBe('ACCOUNT_LOCKED');

    // Even valid password must be blocked while locked
    const lockedLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01711223344',
      password: 'StrongPassword123',
    });
    expect(lockedLogin.status).toBe(403);
    expect(lockedLogin.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rotates refresh tokens and revokes entire family on reuse theft detection', async () => {
    const reg = await registerOwner();
    const refresh1 = reg.body.data.tokens.refreshToken as string;

    const rot = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: refresh1,
    });
    expect(rot.status).toBe(200);
    const refresh2 = rot.body.data.refreshToken as string;
    expect(refresh2).not.toBe(refresh1);

    // Reusing refresh1 should detect theft and revoke refresh2 too
    const reuse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: refresh1,
    });
    expect(reuse.status).toBe(401);

    const afterTheft = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: refresh2,
    });
    expect(afterTheft.status).toBe(401);
  });

  it('updates quick PIN only with valid password and revokes session on logout', async () => {
    const reg = await registerOwner();
    const accessToken = reg.body.data.tokens.accessToken as string;
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const badPinChange = await request(app)
      .post('/api/v1/auth/pin')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'WrongPassword', pin: '5678' });
    expect(badPinChange.status).toBe(401);

    const okPinChange = await request(app)
      .post('/api/v1/auth/pin')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'StrongPassword123', pin: '৫৬৭৮' });
    expect(okPinChange.status).toBe(200);

    const newPinLogin = await request(app).post('/api/v1/auth/pin-login').send({
      phone: '01711223344',
      pin: '5678',
    });
    expect(newPinLogin.status).toBe(200);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logout.status).toBe(200);

    const postLogoutRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(postLogoutRefresh.status).toBe(401);
  });

  it('enforces OWNER/EMPLOYEE RBAC and cross-shop tenant isolation', async () => {
    const shopARes = await registerOwner('01711223344', 'দোকান ক');
    const ownerAToken = shopARes.body.data.tokens.accessToken as string;
    const ownerAId = shopARes.body.data.user.id as string;

    const shopBRes = await registerOwner('01811223344', 'দোকান খ');
    const ownerBToken = shopBRes.body.data.tokens.accessToken as string;

    // Owner A updates shop config
    const patchShop = await request(app)
      .patch('/api/v1/shop')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        allowNegativeStock: true,
        receiptFooterBn: 'ধন্যবাদ, আবার আসবেন',
      });
    expect(patchShop.status).toBe(200);
    expect(patchShop.body.data.shop.allowNegativeStock).toBe(true);

    // Owner A creates Employee
    const createEmp = await request(app)
      .post('/api/v1/shop/users')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: 'করিম কর্মচারী',
        phone: '01911223344',
        password: 'EmployeePass123',
        pin: '4321',
      });
    expect(createEmp.status).toBe(201);
    const empId = createEmp.body.data.user.id as string;

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01911223344',
      password: 'EmployeePass123',
    });
    expect(empLogin.status).toBe(200);
    const empToken = empLogin.body.data.tokens.accessToken as string;
    const empRefresh = empLogin.body.data.tokens.refreshToken as string;

    // Employee can read shop, cannot update shop or list/create staff
    const empGetShop = await request(app)
      .get('/api/v1/shop')
      .set('Authorization', `Bearer ${empToken}`);
    expect(empGetShop.status).toBe(200);

    const empPatchShop = await request(app)
      .patch('/api/v1/shop')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ nameBn: 'হ্যাকড দোকান' });
    expect(empPatchShop.status).toBe(403);
    expect(empPatchShop.body.error.code).toBe('FORBIDDEN_ROLE');

    const empCreateUser = await request(app)
      .post('/api/v1/shop/users')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ name: 'X', phone: '01611223344', password: 'Password123' });
    expect(empCreateUser.status).toBe(403);

    // Owner B cannot modify Shop A employee (404, no tenant leak)
    const crossTenant = await request(app)
      .patch(`/api/v1/shop/users/${empId}`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({ isActive: false });
    expect(crossTenant.status).toBe(404);

    // Owner A cannot deactivate self
    const selfDeactivate = await request(app)
      .patch(`/api/v1/shop/users/${ownerAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ isActive: false });
    expect(selfDeactivate.status).toBe(422);

    // Owner A deactivates employee -> revokes employee access and refresh tokens
    const deactivateEmp = await request(app)
      .patch(`/api/v1/shop/users/${empId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ isActive: false });
    expect(deactivateEmp.status).toBe(200);
    expect(deactivateEmp.body.data.user.isActive).toBe(false);

    const empMeAfterDeactivate = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${empToken}`);
    expect(empMeAfterDeactivate.status).toBe(401);

    const empRefreshAfterDeactivate = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: empRefresh });
    expect(empRefreshAfterDeactivate.status).toBe(401);
  });
});
