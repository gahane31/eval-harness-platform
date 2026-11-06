import type { INestApplication } from '@nestjs/common';
import type { AgentDraftConfig } from '@eval/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { createTestApp, resetDatabase } from '../../../test/create-test-app';
import { agentInput, draftConfig, taskInput } from '../../../test/fixtures';
import { AgentsService } from '../agents/agents.service';
import { TasksService } from '../tasks/tasks.service';
import { ExperimentsService } from './experiments.service';
import { ExecutionService } from './execution.service';
import {
  HERMES_EXECUTION_TIMEOUT_MS,
  type HermesOneshotRequest,
  type HermesOneshotResult,
  type HermesOneshotRunner,
} from './hermes-oneshot';

function success(stdout = 'ok'): HermesOneshotResult {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    launchFailed: false,
    outputLimitExceeded: false,
    durationMs: 25,
    usageError: null,
    usage: {
      session_id: 'local-test',
      completed: true,
      model: 'gpt-5.4-mini',
      provider: 'openai-api',
      api_calls: 1,
      total_tokens: 12,
    },
  };
}

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for execution.');
}

describe('ExecutionService', () => {
  let app: INestApplication;
  let execution: ExecutionService;
  let experiments: ExperimentsService;
  let agents: AgentsService;
  let tasks: TasksService;
  let prisma: PrismaService;
  const execute = jest.fn(async (_request: HermesOneshotRequest): Promise<HermesOneshotResult> =>
    success(),
  );
  const runner: HermesOneshotRunner = { execute };

  beforeAll(async () => {
    app = await createTestApp(undefined, runner);
    execution = app.get(ExecutionService);
    experiments = app.get(ExperimentsService);
    agents = app.get(AgentsService);
    tasks = app.get(TasksService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    execute.mockReset();
    execute.mockImplementation(async () => success());
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs each published configuration against each task snapshot and then completes', async () => {
    const agent = await agents.create(agentInput);
    await agents.updateDraftConfig(agent.id, publishedDraft('Reply briefly.'));
    const first = await agents.publish(agent.id);
    await agents.updateDraftConfig(agent.id, publishedDraft('Reply briefly and stay on topic.'));
    const second = await agents.publish(agent.id);
    const city = await tasks.create(taskInput);
    const greeting = await tasks.create({
      ...taskInput,
      name: 'Standalone greeting',
      input: 'Say hello.',
      tags: ['extra'],
    });
    const created = await experiments.create({
      name: 'Compare prompts',
      agentId: agent.id,
      configurationIds: [first.id, second.id],
      taskSuiteIds: [],
      taskIds: [city.id, greeting.id],
    });
    await agents.updateDraftConfig(agent.id, {
      ...draftConfig,
      profileId: 'default',
      model: 'gpt-4.1-mini',
      systemPrompt: 'This draft must not be used.',
    });

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prompts: string[] = [];
    execute.mockImplementation(async (request) => {
      prompts.push(request.prompt);
      expect(request.profileId).toBe('eval-base');
      expect(request.provider).toBe('openai-api');
      expect(request.model).toBe('gpt-5.4-mini');
      expect(request.reasoning).toBe('medium');
      expect(request.timeoutMs).toBe(HERMES_EXECUTION_TIMEOUT_MS);
      expect(request).not.toHaveProperty('expectedOutcome');
      expect(request.prompt).not.toContain('Paris');
      expect(request.prompt).not.toContain('json_field_equals');
      if (prompts.length === 1) {
        expect(await prisma.run.count()).toBe(1);
        await gate;
      }
      return success();
    });

    try {
      const started = await execution.start(created.id);
      expect(started.status).toBe('RUNNING');
      await waitUntil(() => prompts.length === 1);
      await expect(execution.start(created.id)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(prompts).toHaveLength(1);
      expect(await execution.getExecution(created.id)).toMatchObject({
        status: 'RUNNING',
        planned: 4,
        completed: 0,
        failed: 0,
        pending: 3,
      });
      release();
      await waitUntil(
        async () => (await execution.getExecution(created.id)).status === 'COMPLETED',
      );
    } finally {
      release();
    }

    expect(prompts).toEqual([taskInput.input, 'Say hello.', taskInput.input, 'Say hello.']);
    expect(execute.mock.calls.map((call) => call[0].systemPrompt)).toEqual([
      'Reply briefly.',
      'Reply briefly.',
      'Reply briefly and stay on topic.',
      'Reply briefly and stay on topic.',
    ]);

    const stored = await prisma.run.findMany({ orderBy: [{ startedAt: 'asc' }, { id: 'asc' }] });
    expect(stored).toHaveLength(4);
    expect(stored.every((run) => run.repetitionIndex === 0 && run.status === 'COMPLETED')).toBe(
      true,
    );
    expect(stored[0]).toMatchObject({
      hermesProfile: 'eval-base',
      hermesSessionId: 'local-test',
      finalOutput: 'ok',
      processExitCode: 0,
      error: null,
      runtimeSnapshot: {
        profileId: 'eval-base',
        provider: 'openai-api',
        model: 'gpt-5.4-mini',
        reasoning: 'medium',
        systemPromptApplied: true,
      },
    });
    const listed = await execution.listRuns(created.id);
    expect(listed.map((run) => [run.configurationLabel, run.taskName, run.status])).toEqual([
      ['Version 1', 'Extract city', 'COMPLETED'],
      ['Version 1', 'Standalone greeting', 'COMPLETED'],
      ['Version 2', 'Extract city', 'COMPLETED'],
      ['Version 2', 'Standalone greeting', 'COMPLETED'],
    ]);
    const detail = await execution.getRun(stored[0]!.id);
    expect(detail.usage).toMatchObject({ session_id: 'local-test', completed: true });
    expect(detail.error).toBeNull();

    const finished = await execution.getExecution(created.id);
    expect(finished).toMatchObject({
      status: 'COMPLETED',
      planned: 4,
      completed: 4,
      failed: 0,
      pending: 0,
    });
    await expect(execution.start(created.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('continues after a timed out run and a run that did not complete', async () => {
    const created = await createPair();
    execute.mockImplementation(async (request) => {
      if (request.prompt === taskInput.input) {
        return { ...success('partial'), timedOut: true, exitCode: null };
      }
      return { ...success('visible'), usage: { ...success().usage, completed: false } };
    });

    await execution.start(created.id);
    await waitUntil(async () => (await execution.getExecution(created.id)).status === 'COMPLETED');

    const runs = await execution.listRuns(created.id);
    expect(runs.map((run) => run.status)).toEqual(['TIMED_OUT', 'FAILED']);
    const timedOut = await execution.getRun(runs[0]!.id);
    const failed = await execution.getRun(runs[1]!.id);
    expect(timedOut.error).toBe('Execution timed out after 180 seconds.');
    expect(timedOut.finalOutput).toBe('partial');
    expect(failed.error).toBe('Hermes finished without a completed turn.');
    expect(failed.finalOutput).toBe('visible');
    expect(failed.processExitCode).toBe(0);
    expect(await execution.getExecution(created.id)).toMatchObject({
      status: 'COMPLETED',
      planned: 2,
      completed: 0,
      failed: 2,
      pending: 0,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not start when a published setting cannot be applied', async () => {
    const cases: Array<(snapshot: Record<string, unknown>) => void> = [
      (snapshot) => {
        delete snapshot.profileId;
      },
      (snapshot) => {
        snapshot.skills = ['summarize'];
      },
      (snapshot) => {
        snapshot.reasoning = 'super';
      },
      (snapshot) => {
        snapshot.memory = { enabled: true };
      },
    ];
    for (const update of cases) {
      const created = await createPair();
      await rewriteSnapshot(created.configurations[0]!.agentConfigurationId, update);
      await expect(execution.start(created.id)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect((await experiments.get(created.id)).status).toBe('DRAFT');
    }
    expect(execute).not.toHaveBeenCalled();
  });

  async function createPair() {
    const agent = await agents.create({ ...agentInput, name: `Agent ${Date.now()}` });
    await agents.updateDraftConfig(agent.id, publishedDraft('Answer with the requested format.'));
    const published = await agents.publish(agent.id);
    const city = await tasks.create(taskInput);
    const greeting = await tasks.create({
      ...taskInput,
      name: 'Standalone greeting',
      input: 'Say hello.',
      tags: ['extra'],
    });
    return experiments.create({
      name: 'Two tasks',
      agentId: agent.id,
      configurationIds: [published.id],
      taskSuiteIds: [],
      taskIds: [city.id, greeting.id],
    });
  }

  async function rewriteSnapshot(
    configurationId: string,
    update: (snapshot: Record<string, unknown>) => void,
  ): Promise<void> {
    const row = await prisma.agentConfiguration.findUniqueOrThrow({
      where: { id: configurationId },
    });
    const snapshot = JSON.parse(JSON.stringify(row.configSnapshot)) as Record<string, unknown>;
    update(snapshot);
    await prisma.agentConfiguration.update({
      where: { id: configurationId },
      data: { configSnapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue },
    });
  }
});

function publishedDraft(systemPrompt: string): AgentDraftConfig {
  return {
    ...draftConfig,
    profileId: 'eval-base',
    systemPrompt,
  };
}
