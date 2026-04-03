/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from './../src/app.module';
import { DataSource } from 'typeorm';
import { WebhookService } from './../src/transactions/webhook.service';

describe('Billing Management API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  let webhookService: WebhookService;
  let webhookSpy: jest.SpyInstance;

  // Shared state across tests
  let clientCookies: string[];
  let client2Cookies: string[];
  let adminCookies: string[];
  let clientAccountId: string;
  let client2AccountId: string;
  let clientUserId: string;
  let client2UserId: string;
  let depositTransactionId: string;
  let transferTransactionId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    webhookService = app.get(WebhookService);
    webhookSpy = jest
      .spyOn(webhookService, 'sendTransactionEvent')
      .mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query(`DELETE FROM transactions WHERE TRUE`);
      await dataSource.query(
        `DELETE FROM accounts WHERE "userId" IN (SELECT id FROM users WHERE email LIKE '%@e2e-test.com')`,
      );
      await dataSource.query(
        `DELETE FROM users WHERE email LIKE '%@e2e-test.com'`,
      );
    }
    if (app) {
      await app.close();
    }
  });

  // ─── Helper ──────────────────────────────────────────────
  function extractCookies(res: request.Response): string[] {
    const raw = res.headers['set-cookie'];
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  // ─── HEALTH ──────────────────────────────────────────────
  describe('Health', () => {
    it('GET /health — should return healthy status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.info.database.status).toBe('up');
        });
    });
  });

  // ─── AUTH ────────────────────────────────────────────────
  describe('Auth', () => {
    it('POST /auth/register — should register a new client', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'client1@e2e-test.com', password: 'Test123!' })
        .expect(201);

      expect(res.body.user.email).toBe('client1@e2e-test.com');
      expect(res.body.user.role).toBe('client');
      expect(res.body.message).toBe('Registration successful');

      clientUserId = res.body.user.id;
      clientCookies = extractCookies(res);
      expect(clientCookies.length).toBeGreaterThanOrEqual(2);
    });

    it('POST /auth/register — should register a second client', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'client2@e2e-test.com', password: 'Test123!' })
        .expect(201);

      client2UserId = res.body.user.id;
      client2Cookies = extractCookies(res);
    });

    it('POST /auth/register — should reject duplicate email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'client1@e2e-test.com', password: 'Test123!' })
        .expect(409);
    });

    it('POST /auth/register — should reject weak password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'weak@e2e-test.com', password: '123' })
        .expect(400);
    });

    it('POST /auth/register — should reject invalid email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'Test123!' })
        .expect(400);
    });

    it('POST /auth/login — should login with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'client1@e2e-test.com', password: 'Test123!' })
        .expect(200);

      expect(res.body.user.email).toBe('client1@e2e-test.com');
      expect(res.body.message).toBe('Login successful');
      clientCookies = extractCookies(res);
    });

    it('POST /auth/login — should reject wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'client1@e2e-test.com', password: 'WrongPass1!' })
        .expect(401);
    });

    it('POST /auth/login — should reject non-existent user', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@e2e-test.com', password: 'Test123!' })
        .expect(401);
    });

    it('POST /auth/login — should login as admin (seeded)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@admin.com', password: 'Admin123!' })
        .expect(200);

      expect(res.body.user.role).toBe('admin');
      adminCookies = extractCookies(res);
    });

    it('POST /auth/refresh — should refresh tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', clientCookies)
        .expect(200);

      expect(res.body.message).toBe('Tokens refreshed');
      clientCookies = extractCookies(res);
    });

    it('POST /auth/refresh — should reject without token', () => {
      return request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('POST /auth/logout — should logout', async () => {
      // Login fresh so we have valid cookies to logout
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'client1@e2e-test.com', password: 'Test123!' });
      clientCookies = extractCookies(loginRes);

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', clientCookies)
        .expect(200);

      expect(res.body.message).toBe('Logged out successfully');

      // Re-login for subsequent tests
      const reLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'client1@e2e-test.com', password: 'Test123!' });
      clientCookies = extractCookies(reLogin);
    });

    it('POST /auth/logout — should reject without token', () => {
      return request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });

  // ─── USERS ───────────────────────────────────────────────
  describe('Users', () => {
    it('GET /users/profile — should return own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Cookie', clientCookies)
        .expect(200);

      expect(res.body.email).toBe('client1@e2e-test.com');
      expect(res.body.role).toBe('client');
      expect(res.body.accountId).toBeDefined();
      clientAccountId = res.body.accountId;
    });

    it('GET /users/profile — client2 should get own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Cookie', client2Cookies)
        .expect(200);

      client2AccountId = res.body.accountId;
    });

    it('GET /users/profile — should reject unauthenticated', () => {
      return request(app.getHttpServer()).get('/users/profile').expect(401);
    });

    it('GET /users — admin should get paginated users list', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .query({ page: 1, limit: 2 })
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });

    it('GET /users — client should be forbidden', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Cookie', clientCookies)
        .expect(403);
    });

    it('GET /users/:id — admin should get user by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${clientUserId}`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.id).toBe(clientUserId);
      expect(res.body.email).toBe('client1@e2e-test.com');
    });

    it('GET /users/:id — should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .set('Cookie', adminCookies)
        .expect(404);
    });

    it('PATCH /users/:id/block — admin should block a user', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${client2UserId}/block`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.message).toContain('blocked');
    });

    it('POST /auth/login — blocked user should be forbidden', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'client2@e2e-test.com', password: 'Test123!' })
        .expect(403);
    });

    it('PATCH /users/:id/unblock — admin should unblock a user', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${client2UserId}/unblock`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.message).toContain('unblocked');
    });

    it('POST /auth/login — unblocked user should login again', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'client2@e2e-test.com', password: 'Test123!' })
        .expect(200);

      client2Cookies = extractCookies(res);
    });

    it('PATCH /users/:id/block — client should be forbidden', () => {
      return request(app.getHttpServer())
        .patch(`/users/${client2UserId}/block`)
        .set('Cookie', clientCookies)
        .expect(403);
    });
  });

  // ─── ACCOUNTS ────────────────────────────────────────────
  describe('Accounts', () => {
    it('GET /accounts — should return own account', async () => {
      const res = await request(app.getHttpServer())
        .get('/accounts')
        .set('Cookie', clientCookies)
        .expect(200);

      expect(res.body.id).toBe(clientAccountId);
      expect(res.body.balance).toBeDefined();
    });

    it('GET /accounts — should reject unauthenticated', () => {
      return request(app.getHttpServer()).get('/accounts').expect(401);
    });

    it('POST /accounts/deposit — should deposit funds', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts/deposit')
        .set('Cookie', clientCookies)
        .send({ amount: 500 })
        .expect(201);

      expect(Number(res.body.balance)).toBe(500);
      expect(res.body.transaction.type).toBe('deposit');
      expect(Number(res.body.transaction.amount)).toBe(500);
      expect(res.body.transaction.status).toBe('completed');
      depositTransactionId = res.body.transaction.id;
    });

    it('POST /accounts/deposit — should reject zero amount', () => {
      return request(app.getHttpServer())
        .post('/accounts/deposit')
        .set('Cookie', clientCookies)
        .send({ amount: 0 })
        .expect(400);
    });

    it('POST /accounts/deposit — should reject negative amount', () => {
      return request(app.getHttpServer())
        .post('/accounts/deposit')
        .set('Cookie', clientCookies)
        .send({ amount: -100 })
        .expect(400);
    });

    it('POST /accounts/transfer — should transfer funds', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts/transfer')
        .set('Cookie', clientCookies)
        .send({ toAccountId: client2AccountId, amount: 200 })
        .expect(201);

      expect(Number(res.body.balance)).toBe(300);
      expect(res.body.transaction.type).toBe('transfer');
      expect(Number(res.body.transaction.amount)).toBe(200);
      transferTransactionId = res.body.transaction.id;
    });

    it('POST /accounts/transfer — should reject insufficient funds', () => {
      return request(app.getHttpServer())
        .post('/accounts/transfer')
        .set('Cookie', clientCookies)
        .send({ toAccountId: client2AccountId, amount: 99999 })
        .expect(400);
    });

    it('POST /accounts/transfer — should reject transfer to self', () => {
      return request(app.getHttpServer())
        .post('/accounts/transfer')
        .set('Cookie', clientCookies)
        .send({ toAccountId: clientAccountId, amount: 10 })
        .expect(400);
    });

    it('POST /accounts/transfer — should reject non-existent destination', () => {
      return request(app.getHttpServer())
        .post('/accounts/transfer')
        .set('Cookie', clientCookies)
        .send({
          toAccountId: '00000000-0000-0000-0000-000000000000',
          amount: 10,
        })
        .expect(404);
    });

    it('POST /accounts/deposit — admin should be forbidden (not client role)', () => {
      return request(app.getHttpServer())
        .post('/accounts/deposit')
        .set('Cookie', adminCookies)
        .send({ amount: 100 })
        .expect(403);
    });
  });

  // ─── TRANSACTIONS ────────────────────────────────────────
  describe('Transactions', () => {
    it('GET /transactions — client should get own transactions (paginated)', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions')
        .query({ page: 1, limit: 10 })
        .set('Cookie', clientCookies)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /transactions — should respect pagination limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions')
        .query({ page: 1, limit: 1 })
        .set('Cookie', clientCookies)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.totalPages).toBeGreaterThanOrEqual(2);
    });

    it('GET /transactions/all — admin should get all transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions/all')
        .query({ page: 1, limit: 50 })
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /transactions/all — client should be forbidden', () => {
      return request(app.getHttpServer())
        .get('/transactions/all')
        .set('Cookie', clientCookies)
        .expect(403);
    });

    it('GET /transactions/:id — should get transaction by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/transactions/${depositTransactionId}`)
        .set('Cookie', clientCookies)
        .expect(200);

      expect(res.body.id).toBe(depositTransactionId);
      expect(res.body.type).toBe('deposit');
    });

    it('GET /transactions/:id — should return 404 for non-existent', () => {
      return request(app.getHttpServer())
        .get('/transactions/00000000-0000-0000-0000-000000000000')
        .set('Cookie', clientCookies)
        .expect(404);
    });

    it('PATCH /transactions/:id/cancel — client should cancel own transfer', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/transactions/${transferTransactionId}/cancel`)
        .set('Cookie', clientCookies)
        .expect(200);

      expect(res.body.status).toBe('cancelled');
    });

    it('PATCH /transactions/:id/cancel — should reject already cancelled', () => {
      return request(app.getHttpServer())
        .patch(`/transactions/${transferTransactionId}/cancel`)
        .set('Cookie', clientCookies)
        .expect(400);
    });

    it('POST /accounts/deposit — deposit more for further cancel test', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts/deposit')
        .set('Cookie', client2Cookies)
        .send({ amount: 100 })
        .expect(201);

      depositTransactionId = res.body.transaction.id;
    });

    it('GET /transactions/:id — client should not view others transaction', () => {
      return request(app.getHttpServer())
        .get(`/transactions/${depositTransactionId}`)
        .set('Cookie', clientCookies)
        .expect(403);
    });

    it('PATCH /transactions/:id/cancel — client should not cancel others transaction', () => {
      return request(app.getHttpServer())
        .patch(`/transactions/${depositTransactionId}/cancel`)
        .set('Cookie', clientCookies)
        .expect(403);
    });

    it('PATCH /transactions/:id/cancel — admin should cancel any transaction', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/transactions/${depositTransactionId}/cancel`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.status).toBe('cancelled');
    });

    it('GET /accounts — verify balances after cancellations', async () => {
      const res = await request(app.getHttpServer())
        .get('/accounts')
        .set('Cookie', clientCookies)
        .expect(200);

      // Started 500, transferred 200 (cancelled) → 500
      expect(Number(res.body.balance)).toBe(500);
    });
  });

  // ─── WEBHOOK ─────────────────────────────────────────────
  describe('Webhook', () => {
    beforeEach(() => {
      webhookSpy.mockClear();
    });

    it('should send webhook on deposit', async () => {
      await request(app.getHttpServer())
        .post('/accounts/deposit')
        .set('Cookie', clientCookies)
        .send({ amount: 1 })
        .expect(201);

      expect(webhookSpy).toHaveBeenCalledTimes(1);
      expect(webhookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deposit',
          status: 'completed',
        }),
      );
    });

    it('should send webhook on transfer', async () => {
      await request(app.getHttpServer())
        .post('/accounts/transfer')
        .set('Cookie', clientCookies)
        .send({ toAccountId: client2AccountId, amount: 1 })
        .expect(201);

      expect(webhookSpy).toHaveBeenCalledTimes(1);
      expect(webhookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transfer',
          status: 'completed',
        }),
      );
    });

    it('should send webhook on cancel', async () => {
      // Deposit to have something to cancel
      const depositRes = await request(app.getHttpServer())
        .post('/accounts/deposit')
        .set('Cookie', clientCookies)
        .send({ amount: 1 })
        .expect(201);

      webhookSpy.mockClear();

      await request(app.getHttpServer())
        .patch(`/transactions/${depositRes.body.transaction.id}/cancel`)
        .set('Cookie', clientCookies)
        .expect(200);

      expect(webhookSpy).toHaveBeenCalledTimes(1);
      expect(webhookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
        }),
      );
    });
  });

  // ─── DEACTIVATION ────────────────────────────────────────
  describe('Account Deactivation', () => {
    it('PATCH /users/deactivate — user should deactivate own account', async () => {
      // Register a disposable user
      const regRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'disposable@e2e-test.com', password: 'Test123!' })
        .expect(201);

      const disposableCookies = extractCookies(regRes);

      const res = await request(app.getHttpServer())
        .patch('/users/deactivate')
        .set('Cookie', disposableCookies)
        .expect(200);

      expect(res.body.message).toBe('Your account has been deactivated');
    });

    it('POST /auth/login — deactivated user should be forbidden', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'disposable@e2e-test.com', password: 'Test123!' })
        .expect(403);
    });

    it('Deactivated user transactions should remain in the system', async () => {
      // Admin can still see all transactions
      const res = await request(app.getHttpServer())
        .get('/transactions/all')
        .query({ page: 1, limit: 50 })
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
