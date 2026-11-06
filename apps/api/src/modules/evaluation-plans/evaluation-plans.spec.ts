import type { INestApplication } from '@nestjs/common';
import type { EvaluationPlanWrite } from '@eval/shared';
import { createTestApp, resetDatabase } from '../../../test/create-test-app';
import { agentInput, draftConfig, taskInput } from '../../../test/fixtures';
import { PrismaService } from '../../database/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { ExperimentsService } from '../experiments/experiments.service';
import {
  type HermesOneshotRequest,
  type HermesOneshotResult,
  type HermesOneshotRunner,
} from '../experiments/hermes-oneshot';
import { TaskSuitesService } from '../task-suites/task-suites.service';
import { TasksService } from '../tasks/tasks.service';
import { BatchesService } from './batches.service';
import { DashboardService } from './dashboard.service';
import { PlansService } from './plans.service';

function result(stdout: string, cost?: number): HermesOneshotResult {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    launchFailed: false,
    outputLimitExceeded: false,
    durationMs: 5,
    usageError: null,
    usage: {
      completed: true,
      ...(cost === undefined ? {} : { estimated_cost_usd: cost, cost_status: 'estimated' }),
    },
  };
}

function answer(request: HermesOneshotRequest): HermesOneshotResult {
  if (request.prompt.includes('EXECUTION_FAIL')) {
    return { ...result('nope'), exitCode: 1, usage: { completed: false } };
  }
  if (request.prompt.includes('FAIL_CASE')) {
    return result('{"city":"Lyon"}');
  }
  return result('{"city":"Paris"}', 0.02);
}

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the batch.');
}

describe('Evaluation plans and batches', () => {
  let app: INestApplication;
  let plans: PlansService;
  let batches: BatchesService;
  let dashboard: DashboardService;
  let agents: AgentsService;
  let tasks: TasksService;
  let suites: TaskSuitesService;
  let experiments: ExperimentsService;
  let prisma: PrismaService;
  let openGate = (): void => undefined;
  const execute = jest.fn(async (request: HermesOneshotRequest) => answer(request));
  const runner: HermesOneshotRunner = { execute };

  beforeAll(async () => {
    app = await createTestApp(undefined, runner);
    plans = app.get(PlansService);
    batches = app.get(BatchesService);
    dashboard = app.get(DashboardService);
    agents = app.get(AgentsService);
    tasks = app.get(TasksService);
    suites = app.get(TaskSuitesService);
    experiments = app.get(ExperimentsService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    openGate = () => undefined;
    execute.mockReset();
    execute.mockImplementation(async (request) => answer(request));
  });

  afterEach(async () => {
    openGate();
    await waitUntil(
      async () => (await prisma.experiment.count({ where: { status: 'RUNNING' } })) === 0,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows an empty dashboard without inventing a pass rate or cost', async () => {
    const summary = await dashboard.get();
    expect(summary.agents).toBe(0);
    expect(summary.evaluationsToday).toBe(0);
    expect(summary.passRateToday).toBeNull();
    expect(summary.costToday).toBeNull();
    expect(summary.attention).toEqual([]);
    expect(summary.recent).toEqual([]);
    expect(summary.latestBatch).toBeNull();
  });

  it('creates, edits, and enables or disables plans and entries', async () => {
    const first = await publishedAgent('Refund');
    const second = await publishedAgent('Profile');
    const refunds = await suiteFor(first.agent.id, 'Refunds', 'Refund question');
    const profiles = await suiteFor(second.agent.id, 'Profiles', 'Profile question');
    const created = await plans.create({
      name: 'Nightly',
      description: 'Weekday checks',
      enabled: true,
      entries: [
        planEntry(first.agent.id, refunds.id),
        planEntry(second.agent.id, profiles.id, { enabled: false }),
      ],
    });
    expect(created.entries.map((entry) => entry.agentName)).toEqual(['Refund', 'Profile']);
    expect(created.entries[1]?.enabled).toBe(false);

    const disabled = await plans.update(created.id, {
      name: 'Nightly revised',
      description: null,
      enabled: false,
      entries: [planEntry(first.agent.id, refunds.id)],
    });
    expect(disabled.name).toBe('Nightly revised');
    expect(disabled.description).toBeNull();
    expect(disabled.enabled).toBe(false);
    expect(disabled.entries).toHaveLength(1);
    await expect(batches.start()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.evaluationBatch.count()).toBe(0);

    await plans.update(created.id, {
      name: 'Nightly revised',
      enabled: true,
      entries: [
        planEntry(first.agent.id, refunds.id, { enabled: false }),
        planEntry(second.agent.id, profiles.id),
      ],
    });
    const batch = await finishedBatch();
    expect(batch.items.map((item) => item.agentName)).toEqual(['Profile']);
    expect(batch.counts).toMatchObject({ total: 1, completed: 1, failed: 0 });
  });

  it('rejects invalid plan entries', async () => {
    const first = await publishedAgent('Refund');
    const second = await publishedAgent('Profile');
    const foreign = await suiteFor(second.agent.id, 'Foreign', 'Foreign question');
    const own = await suiteFor(first.agent.id, 'Refunds', 'Refund question');
    await expect(
      plans.create({
        name: 'Wrong suite',
        enabled: true,
        entries: [planEntry(first.agent.id, foreign.id)],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      plans.create({
        name: 'Duplicate',
        enabled: true,
        entries: [planEntry(first.agent.id, own.id), planEntry(first.agent.id, own.id)],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      plans.create({
        name: 'Wrong version',
        enabled: true,
        entries: [
          planEntry(first.agent.id, own.id, {
            versionPolicy: 'PINNED',
            pinnedVersionId: second.version.id,
          }),
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const unpublished = await agents.create({ ...agentInput, name: 'Draft only' });
    const unpublishedSuite = await suiteFor(unpublished.id, 'Draft suite', 'Draft question');
    await expect(
      plans.create({
        name: 'No version',
        enabled: true,
        entries: [planEntry(unpublished.id, unpublishedSuite.id)],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const removable = await plans.create({
      name: 'Removable tasks',
      enabled: true,
      entries: [planEntry(first.agent.id, own.id)],
    });
    await suites.replaceTasks(first.agent.id, own.id, { taskIds: [] });
    await expect(batches.start()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.evaluationBatch.count()).toBe(0);
    expect(removable.entries).toHaveLength(1);
  });

  it('resolves the latest published version at execution time and keeps a pinned version', async () => {
    const { agent, version: first } = await publishedAgent('Refund');
    const latestSuite = await suiteFor(agent.id, 'Latest suite', 'Latest question');
    const pinnedSuite = await suiteFor(agent.id, 'Pinned suite', 'Pinned question');
    await plans.create({
      name: 'Versions',
      enabled: true,
      entries: [
        planEntry(agent.id, latestSuite.id),
        planEntry(agent.id, pinnedSuite.id, {
          versionPolicy: 'PINNED',
          pinnedVersionId: first.id,
        }),
      ],
    });
    await agents.updateDraftConfig(agent.id, { ...draftConfig, systemPrompt: 'Second prompt.' });
    const second = await agents.publish(agent.id);

    const batch = await finishedBatch();
    expect(batch.items).toHaveLength(2);
    expect(batch.items.find((item) => item.taskSuiteName === 'Latest suite')?.versionId).toBe(
      second.id,
    );
    expect(batch.items.find((item) => item.taskSuiteName === 'Pinned suite')?.version).toBe(1);
    const latestExperiment = await experiments.get(
      batch.items.find((item) => item.versionId === second.id)?.experimentId ?? '',
    );
    expect(latestExperiment.configurations[0]?.agentConfigurationId).toBe(second.id);
    expect(latestExperiment.status).toBe('COMPLETED');
    expect(await prisma.evaluation.count()).toBe(2);
  });

  it('runs every enabled entry, including two suites for one agent, through the existing execution flow', async () => {
    const refund = await publishedAgent('Refund');
    const profile = await publishedAgent('Profile');
    const firstSuite = await suiteFor(refund.agent.id, 'Refunds', 'Refund question');
    const secondSuite = await suiteFor(refund.agent.id, 'Edge cases', 'Edge question');
    const profileSuite = await suiteFor(profile.agent.id, 'Profiles', 'Profile question');
    await plans.create({
      name: 'All agents',
      enabled: true,
      entries: [
        planEntry(refund.agent.id, firstSuite.id),
        planEntry(refund.agent.id, secondSuite.id),
        planEntry(profile.agent.id, profileSuite.id),
      ],
    });

    const batch = await finishedBatch();
    expect(batch.counts).toMatchObject({ total: 3, completed: 3, failed: 0 });
    expect(new Set(batch.items.map((item) => item.agentName))).toEqual(
      new Set(['Refund', 'Profile']),
    );
    expect(batch.items.filter((item) => item.agentId === refund.agent.id)).toHaveLength(2);
    expect(await prisma.experiment.count()).toBe(3);
    const reread = await batches.get(batch.id);
    expect(reread.status).toBe('COMPLETED');
    expect(reread.items).toHaveLength(3);
  });

  it('keeps the other evaluations running when one execution fails', async () => {
    const refund = await publishedAgent('Refund');
    const profile = await publishedAgent('Profile');
    const failing = await suiteFor(refund.agent.id, 'Failing', 'EXECUTION_FAIL this run');
    const passing = await suiteFor(profile.agent.id, 'Passing', 'Profile question');
    await plans.create({
      name: 'Partial',
      enabled: true,
      entries: [planEntry(refund.agent.id, failing.id), planEntry(profile.agent.id, passing.id)],
    });

    const batch = await finishedBatch();
    expect(batch.status).toBe('COMPLETED');
    expect(batch.counts).toMatchObject({ total: 2, completed: 1, failed: 1 });
    const passed = batch.items.find((item) => item.status === 'COMPLETED');
    const failed = batch.items.find((item) => item.status === 'FAILED');
    expect(passed?.agentName).toBe('Profile');
    expect(await experiments.get(passed?.experimentId ?? '')).toMatchObject({
      status: 'COMPLETED',
    });
    expect(
      await prisma.evaluation.count({ where: { run: { experimentId: passed?.experimentId } } }),
    ).toBe(1);
    expect(
      await prisma.evaluation.count({ where: { run: { experimentId: failed?.experimentId } } }),
    ).toBe(0);
  });

  it('tracks progress, rejects a second batch, and allows another batch after completion', async () => {
    const refund = await publishedAgent('Refund');
    const profile = await publishedAgent('Profile');
    await plans.create({
      name: 'Gated',
      enabled: true,
      entries: [
        planEntry(
          refund.agent.id,
          (await suiteFor(refund.agent.id, 'Refunds', 'Refund question')).id,
        ),
        planEntry(
          profile.agent.id,
          (await suiteFor(profile.agent.id, 'Profiles', 'Profile question')).id,
        ),
      ],
    });
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    openGate = release;
    execute.mockImplementation(async () => {
      await gate;
      return result('{"city":"Paris"}');
    });

    const runningPromise = batches.start();
    const duplicate = batches.start();
    const [running, rejected] = await Promise.allSettled([runningPromise, duplicate]);
    expect(running.status).toBe('fulfilled');
    expect(rejected.status).toBe('rejected');
    expect(rejected.status === 'rejected' ? rejected.reason : null).toMatchObject({
      code: 'CONFLICT',
    });
    expect(await prisma.evaluationBatch.count()).toBe(1);
    if (running.status === 'fulfilled') {
      expect(running.value.counts).toMatchObject({ total: 2, running: 2, completed: 0 });
    }
    release();
    const completed = await waitForBatch(running.status === 'fulfilled' ? running.value.id : '');
    expect(completed.status).toBe('COMPLETED');
    expect(completed.counts.completed).toBe(2);

    const next = await finishedBatch();
    expect(next.id).not.toBe(completed.id);
    expect(await prisma.evaluationBatch.count()).toBe(2);
  });

  it('aggregates pass rate from test cases and does not treat a missing cost as zero', async () => {
    const { agent } = await publishedAgent('Refund');
    const passing = await suiteFor(agent.id, 'Passing', 'PASS_CASE question');
    const failOne = await tasks.create({ ...taskInput, name: 'Fail one', input: 'FAIL_CASE one' });
    const failTwo = await tasks.create({ ...taskInput, name: 'Fail two', input: 'FAIL_CASE two' });
    const failing = await suites.create(agent.id, { name: 'Failing' });
    await suites.replaceTasks(agent.id, failing.id, { taskIds: [failOne.id, failTwo.id] });
    await plans.create({
      name: 'Quality',
      enabled: true,
      entries: [
        planEntry(agent.id, passing.id, { passRateThreshold: 0.5 }),
        planEntry(agent.id, failing.id, { passRateThreshold: 0.8 }),
      ],
    });

    const batch = await finishedBatch();
    expect(batch.passedTestCases).toBe(1);
    expect(batch.completedTestCases).toBe(3);
    expect(batch.passRate).toBeCloseTo(1 / 3);
    expect(batch.cost).toEqual({ total: 0.02, costedRuns: 1, runs: 3, estimated: true });
    const failingItem = batch.items.find((item) => item.taskSuiteName === 'Failing');
    expect(failingItem?.passRate).toBe(0);
    expect(failingItem?.thresholdMet).toBe(false);

    const summary = await dashboard.get();
    expect(summary.evaluationsToday).toBe(2);
    expect(summary.agentsEvaluatedToday).toBe(1);
    expect(summary.passRateToday).toBeCloseTo(1 / 3);
    expect(summary.costToday).toEqual(batch.cost);
    expect(summary.attention).toEqual([
      expect.objectContaining({
        kind: 'threshold',
        experimentId: failingItem?.experimentId,
      }),
    ]);
    expect(summary.recent).toHaveLength(2);
    expect(summary.latestBatch?.id).toBe(batch.id);
  });

  async function publishedAgent(name: string) {
    const agent = await agents.create({ ...agentInput, name });
    const version = await agents.publish(agent.id);
    return { agent, version };
  }

  async function suiteFor(agentId: string, name: string, input: string) {
    const task = await tasks.create({ ...taskInput, name, input });
    const created = await suites.create(agentId, { name });
    await suites.replaceTasks(agentId, created.id, { taskIds: [task.id] });
    return created;
  }

  async function finishedBatch() {
    const started = await batches.start();
    return waitForBatch(started.id);
  }

  async function waitForBatch(id: string) {
    await waitUntil(async () => (await batches.get(id)).status !== 'RUNNING');
    return batches.get(id);
  }
});

function planEntry(
  agentId: string,
  taskSuiteId: string,
  extra: Partial<EvaluationPlanWrite['entries'][number]> = {},
): EvaluationPlanWrite['entries'][number] {
  return {
    agentId,
    taskSuiteId,
    versionPolicy: 'LATEST_PUBLISHED',
    enabled: true,
    ...extra,
  };
}
