import type { INestApplication } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { PrismaService } from '../../database/prisma.service';
import { createTestApp, resetDatabase } from '../../../test/create-test-app';
import { agentInput, draftConfig } from '../../../test/fixtures';

describe('AgentsService', () => {
  let app: INestApplication;
  let agents: AgentsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    agents = app.get(AgentsService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, reads, and updates an agent without publishing a configuration version', async () => {
    const created = await agents.create(agentInput);
    expect(created.name).toBe(agentInput.name);
    expect(created.draftConfig).toEqual(draftConfig);
    expect(created.description).toBe(agentInput.description);

    const fetched = await agents.get(created.id);
    expect(fetched).toEqual(created);

    const renamed = await agents.update(created.id, { name: 'Renamed agent', description: null });
    expect(renamed.name).toBe('Renamed agent');
    expect(renamed.description).toBeNull();

    const nextDraft = {
      ...draftConfig,
      systemPrompt: 'Use concise answers.',
      memory: { enabled: true },
    };
    const reconfigured = await agents.updateDraftConfig(created.id, nextDraft);
    expect(reconfigured.draftConfig).toEqual(nextDraft);
    expect(await prisma.agentConfiguration.count()).toBe(0);
  });

  it('paginates agents and reports a missing agent', async () => {
    await agents.create({ ...agentInput, name: 'One' });
    await agents.create({ ...agentInput, name: 'Two' });
    await agents.create({ ...agentInput, name: 'Three' });

    const page = await agents.list({ page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

    await expect(agents.get('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
