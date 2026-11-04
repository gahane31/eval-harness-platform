import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';
import { agentInput, taskInput } from './fixtures';

describe('HTTP API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports database connectivity without leaking the database location', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok', database: 'up' },
    });
    expect(response.body.meta.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(response.body)).not.toContain('.db');
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });

  it('returns the standard error envelope when the database check fails', async () => {
    const prisma = app.get(PrismaService);
    const query = jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValueOnce(new Error('file:/secret/dev.db'));

    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is unavailable.',
        details: [],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
    query.mockRestore();
  });

  it('rejects invalid payloads and query parameters with field paths', async () => {
    const invalidAgent = await request(app.getHttpServer())
      .post('/api/v1/agents')
      .send({ name: '', draftConfig: { provider: 'openai' } })
      .expect(400);
    expect(invalidAgent.body.success).toBe(false);
    expect(invalidAgent.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalidAgent.body.error.details.map((detail: { path: string }) => detail.path)).toEqual(
      expect.arrayContaining(['name', 'draftConfig.model']),
    );
    expect(invalidAgent.body.meta.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(invalidAgent.body)).not.toContain('stack');

    const invalidPage = await request(app.getHttpServer())
      .get('/api/v1/tasks')
      .query({ page: 0, pageSize: 500 })
      .expect(400);
    expect(invalidPage.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalidPage.body.error.details.map((detail: { path: string }) => detail.path)).toEqual(
      expect.arrayContaining(['page', 'pageSize']),
    );

    const malformed = await request(app.getHttpServer())
      .post('/api/v1/agents')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    expect(malformed.body.error.message).toBe('Invalid JSON body.');
  });

  it('creates and lists agents and tasks through the public envelope', async () => {
    const requestId = 'request-123';
    const created = await request(app.getHttpServer())
      .post('/api/v1/agents')
      .set('x-request-id', requestId)
      .send(agentInput)
      .expect(201);
    expect(created.headers['x-request-id']).toBe(requestId);
    expect(created.body.meta.requestId).toBe(requestId);
    expect(created.body.data.draftConfig).toEqual(agentInput.draftConfig);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/agents')
      .query({ page: 1, pageSize: 10 })
      .expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1, totalPages: 1 });

    const task = await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .send(taskInput)
      .expect(201);
    const tasks = await request(app.getHttpServer()).get('/api/v1/tasks').expect(200);
    expect(tasks.body.data[0].id).toBe(task.body.data.id);

    await request(app.getHttpServer())
      .get('/api/v1/agents/not-a-uuid')
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

    await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Resource not found.', details: [] },
        });
      });
  });
});
