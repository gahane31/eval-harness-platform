import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDatabase } from './create-test-app';
import { createFakeRuntime } from './fake-runtime';
import { agentInput } from './fixtures';

describe('runtime and configuration HTTP API', () => {
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

  it('requires a profile and returns that profile catalogue inside the envelope', async () => {
    await request(app.getHttpServer()).get('/api/v1/runtime/skills').expect(400);

    const skills = await request(app.getHttpServer())
      .get('/api/v1/runtime/skills')
      .query({ profile: 'eval-base' })
      .expect(200);
    expect(skills.body.success).toBe(true);
    expect(skills.body.data.profile).toBe('eval-base');
    expect(skills.body.data.skills).toEqual([]);
    expect(skills.body.meta.requestId).toEqual(expect.any(String));
    expect(skills.headers['x-request-id']).toBe(skills.body.meta.requestId);

    const defaults = await request(app.getHttpServer())
      .get('/api/v1/runtime/skills')
      .query({ profile: 'default' })
      .expect(200);
    expect(defaults.body.data.skills.map((skill: { id: string }) => skill.id)).toEqual([
      'summarize',
      'outline',
    ]);
  });

  it('publishes an immutable version and reports an unknown version as 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/agents')
      .send(agentInput)
      .expect(201);
    const validated = await request(app.getHttpServer())
      .post(`/api/v1/agents/${created.body.data.id}/configuration/validate`)
      .expect(200);
    expect(validated.body.data.valid).toBe(true);

    const published = await request(app.getHttpServer())
      .post(`/api/v1/agents/${created.body.data.id}/configuration-versions`)
      .expect(200);

    expect(published.body.data).toMatchObject({ version: 1, reused: false });
    expect(published.body.data.warnings.length).toBeGreaterThan(0);

    const reused = await request(app.getHttpServer())
      .post(`/api/v1/agents/${created.body.data.id}/configuration-versions`)
      .expect(200);
    expect(reused.body.data.reused).toBe(true);

    await request(app.getHttpServer())
      .put(`/api/v1/agents/${created.body.data.id}/configuration`)
      .send({ ...agentInput.draftConfig, skills: ['summarize'], toolsets: ['web'] })
      .expect(200);
    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/agents/${created.body.data.id}/configuration-versions`)
      .expect(400);
    expect(rejected.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'skills', code: 'UNSUPPORTED_CAPABILITY' }),
        expect.objectContaining({ path: 'toolsets', code: 'UNSUPPORTED_CAPABILITY' }),
      ]),
    );

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/agents/${created.body.data.id}/configuration-versions`)
      .query({ page: 1, pageSize: 10 })
      .expect(200);
    expect(listed.body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1, totalPages: 1 });

    await request(app.getHttpServer())
      .get(`/api/v1/configuration-versions/${published.body.data.id}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/configuration-versions/11111111-1111-4111-8111-111111111111')
      .expect(404)
      .expect((response) => {
        expect(response.body.error.code).toBe('NOT_FOUND');
      });
  });
});

describe('failed runtime discovery', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const runtime = createFakeRuntime();
    runtime.getSkills = async (scope) => ({
      profile: scope.profile,
      skills: [],
      cached: false,
      discoveredAt: '2026-11-04T00:00:00.000Z',
      discoveryErrors: [
        {
          capability: 'skills',
          code: 'COMMAND_FAILED',
          message: 'Hermes skill discovery failed.',
          exitCode: 1,
        },
      ],
    });
    app = await createTestApp(runtime);
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not present a failed catalogue as an empty success', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/runtime/skills')
      .query({ profile: 'default' })
      .expect(200);

    expect(response.body.data.skills).toEqual([]);
    expect(response.body.data.discoveryErrors).toEqual([
      expect.objectContaining({ code: 'COMMAND_FAILED', exitCode: 1 }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });
});
