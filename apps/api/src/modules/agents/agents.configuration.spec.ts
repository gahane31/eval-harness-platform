import type { INestApplication } from '@nestjs/common';
import { stableConfigHash } from '../../common/utils/canonical-json';
import { PrismaService } from '../../database/prisma.service';
import { validateAgentDraft } from '../runtime/validate-draft';
import { createTestApp, resetDatabase } from '../../../test/create-test-app';
import { agentInput, draftConfig, selectedCapabilitiesDraft } from '../../../test/fixtures';
import { AgentsService } from './agents.service';

describe('agent configuration versions', () => {
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

  it('saves a draft without creating a version', async () => {
    const created = await agents.create(agentInput);
    const saved = await agents.updateDraftConfig(created.id, {
      ...draftConfig,
      systemPrompt: 'Shorter answers.',
    });

    expect(saved.draftConfig.systemPrompt).toBe('Shorter answers.');
    expect(saved.publishedVersionCount).toBe(0);
    expect(await prisma.agentConfiguration.count()).toBe(0);
  });

  it('publishes version 1, reuses the same canonical config, and stores warnings', async () => {
    const created = await agents.create(agentInput);
    const first = await agents.publish(created.id);
    const second = await agents.publish(created.id);

    expect(first.version).toBe(1);
    expect(first.reused).toBe(false);
    expect(first.configHash).toBe(stableConfigHash(draftConfig));
    expect(first.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['UNVERIFIED_BEHAVIOR']),
    );
    expect(second.reused).toBe(true);
    expect(second.id).toBe(first.id);
    expect(await prisma.agentConfiguration.count()).toBe(1);

    const listed = await agents.listVersions(created.id, { page: 1, pageSize: 20 });
    expect(listed.items).toHaveLength(1);
    expect(listed.meta.total).toBe(1);
  });

  it('creates a new version for a distinct config and leaves the old snapshot unchanged', async () => {
    const created = await agents.create(agentInput);
    const first = await agents.publish(created.id);
    const nextDraft = { ...draftConfig, systemPrompt: 'Use a different prompt.' };
    await agents.updateDraftConfig(created.id, nextDraft);
    const second = await agents.publish(created.id);
    const historical = await agents.getVersion(first.id);

    expect(second.version).toBe(2);
    expect(second.reused).toBe(false);
    expect(historical.configSnapshot.systemPrompt).toBe(draftConfig.systemPrompt);
    expect(historical.configHash).not.toBe(second.configHash);
  });

  it('warns when the profile configures the model but callability is unverified', async () => {
    const created = await agents.create(agentInput);
    const validation = await agents.validateDraft(created.id);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'model',
          code: 'UNVERIFIED_BEHAVIOR',
        }),
      ]),
    );
  });

  it('blocks a reported model whose availability is unavailable', () => {
    const validation = validateAgentDraft(draftConfig, {
      providers: [
        {
          provider: 'openai-api',
          models: [
            {
              id: 'gpt-5.4-mini',
              name: 'gpt-5.4-mini',
              availability: 'unavailable',
              limitation: 'The provider reports this model as unavailable.',
            },
          ],
        },
      ],
      skills: [],
      toolsets: [],
      modelsFailed: false,
      skillsFailed: false,
      toolsetsFailed: false,
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual([
      expect.objectContaining({
        path: 'model',
        code: 'UNSUPPORTED_CAPABILITY',
        message: 'The provider reports this model as unavailable.',
      }),
    ]);
  });

  it('reads older drafts and snapshots without assigning a profile or rewriting them', async () => {
    const created = await agents.create(agentInput);
    const published = await agents.publish(created.id);
    const { profileId: _profileId, ...legacyDraft } = draftConfig;
    const legacySnapshot = { ...legacyDraft, systemPrompt: 'Historical snapshot.' };
    const legacyHash = 'ab'.repeat(32);

    await prisma.agent.update({
      where: { id: created.id },
      data: { draftConfig: legacyDraft },
    });
    await prisma.agentConfiguration.update({
      where: { id: published.id },
      data: { configSnapshot: legacySnapshot, configHash: legacyHash },
    });

    const read = await agents.get(created.id);
    const version = await agents.getVersion(published.id);
    expect(read.draftConfig.profileId).toBeUndefined();
    expect(version.configSnapshot.profileId).toBeUndefined();
    expect(version.configSnapshot.systemPrompt).toBe('Historical snapshot.');
    expect(version.configHash).toBe(legacyHash);

    const validation = await agents.validateDraft(created.id);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual([
      expect.objectContaining({ path: 'profileId', code: 'UNSUPPORTED_CAPABILITY' }),
    ]);
    await expect(agents.publish(created.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'profileId', code: 'UNSUPPORTED_CAPABILITY' })],
    });

    const storedAgent = await prisma.agent.findUniqueOrThrow({ where: { id: created.id } });
    const storedVersion = await prisma.agentConfiguration.findUniqueOrThrow({
      where: { id: published.id },
    });
    expect(storedAgent.draftConfig).toEqual(legacyDraft);
    expect(storedVersion.configSnapshot).toEqual(legacySnapshot);
    expect(storedVersion.configHash).toBe(legacyHash);
    expect(await prisma.agentConfiguration.count()).toBe(1);
  });

  it('publishes a different version when only the profile id changes', async () => {
    const created = await agents.create(agentInput);
    const first = await agents.publish(created.id);
    await agents.updateDraftConfig(created.id, { ...draftConfig, profileId: 'eval-base' });
    const second = await agents.publish(created.id);

    expect(first.configSnapshot.profileId).toBe('default');
    expect(second.version).toBe(2);
    expect(second.reused).toBe(false);
    expect(second.configSnapshot.profileId).toBe('eval-base');
    expect(second.configHash).not.toBe(first.configHash);
    expect(await prisma.agentConfiguration.count()).toBe(2);
  });

  it('rejects selected non-configurable skills and toolsets without publishing', async () => {
    const created = await agents.create({
      ...agentInput,
      draftConfig: selectedCapabilitiesDraft,
    });
    const validation = await agents.validateDraft(created.id);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'skills', code: 'UNSUPPORTED_CAPABILITY' }),
        expect.objectContaining({ path: 'toolsets', code: 'UNSUPPORTED_CAPABILITY' }),
      ]),
    );
    await expect(agents.publish(created.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([
        expect.objectContaining({ path: 'skills', code: 'UNSUPPORTED_CAPABILITY' }),
      ]),
    });
    expect((await agents.get(created.id)).draftConfig).toEqual(selectedCapabilitiesDraft);
    expect(await prisma.agentConfiguration.count()).toBe(0);
  });

  it('rejects a model that the stored profile does not configure', async () => {
    const created = await agents.create({
      ...agentInput,
      draftConfig: {
        ...draftConfig,
        profileId: 'eval-base',
        provider: 'openai',
        model: 'gpt-4.1-mini',
      },
    });
    await expect(agents.publish(created.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'model', code: 'UNSUPPORTED_CAPABILITY' })],
    });

    const reread = await agents.get(created.id);
    expect(reread.draftConfig.model).toBe('gpt-4.1-mini');
    expect(await prisma.agentConfiguration.count()).toBe(0);
    const validation = await agents.validateDraft(created.id);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual([
      expect.objectContaining({ path: 'model', code: 'UNSUPPORTED_CAPABILITY' }),
    ]);
    expect(validation.warnings.some((warning) => warning.path === 'model')).toBe(false);
  });

  it('does not create duplicate versions when the same config is published concurrently', async () => {
    const created = await agents.create(agentInput);
    const results = await Promise.all([agents.publish(created.id), agents.publish(created.id)]);

    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.filter((result) => result.reused)).toHaveLength(1);
    expect(await prisma.agentConfiguration.count()).toBe(1);
  });
});
