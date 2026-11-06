import type { INestApplication } from '@nestjs/common';
import type { AgentDraftConfig, TaskCreateRequest } from '@eval/shared';
import { PrismaService } from '../../database/prisma.service';
import { createTestApp, resetDatabase } from '../../../test/create-test-app';
import { agentInput, draftConfig } from '../../../test/fixtures';
import { AgentsService } from '../agents/agents.service';
import { TasksService } from '../tasks/tasks.service';
import { EvaluationService } from './evaluation.service';
import { ExecutionService } from './execution.service';
import { ExperimentsService } from './experiments.service';
import type {
  HermesOneshotRequest,
  HermesOneshotResult,
  HermesOneshotRunner,
} from './hermes-oneshot';

function success(stdout: string): HermesOneshotResult {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    launchFailed: false,
    outputLimitExceeded: false,
    durationMs: 20,
    usageError: null,
    usage: {
      session_id: 'local-eval',
      completed: true,
      model: 'gpt-5.4-mini',
      provider: 'openai-api',
    },
  };
}

describe('EvaluationService', () => {
  let app: INestApplication;
  let evaluation: EvaluationService;
  let execution: ExecutionService;
  let experiments: ExperimentsService;
  let agents: AgentsService;
  let tasks: TasksService;
  let prisma: PrismaService;
  const execute = jest.fn(async (request: HermesOneshotRequest): Promise<HermesOneshotResult> => {
    if (request.prompt === 'Say hello.') {
      return success('hello');
    }
    if (request.prompt === 'Second city') {
      return success('not json');
    }
    return success('{"city":"Paris"}');
  });
  const runner: HermesOneshotRunner = { execute };

  beforeAll(async () => {
    app = await createTestApp(undefined, runner);
    evaluation = app.get(EvaluationService);
    execution = app.get(ExecutionService);
    experiments = app.get(ExperimentsService);
    agents = app.get(AgentsService);
    tasks = app.get(TasksService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    execute.mockReset();
    execute.mockImplementation(async (request) => {
      if (request.prompt === 'Say hello.') {
        return success('hello');
      }
      return success('{"city":"Paris"}');
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('evaluates completed runs from the task snapshot and compares configurations', async () => {
    const agent = await agents.create(agentInput);
    await agents.updateDraftConfig(agent.id, publishedDraft('Reply briefly.'));
    const first = await agents.publish(agent.id);
    await agents.updateDraftConfig(agent.id, publishedDraft('Reply with JSON.'));
    const second = await agents.publish(agent.id);
    const city = await tasks.create(cityTask('What city is the Eiffel Tower in?'));
    const greeting = await tasks.create(greetingTask());
    const created = await experiments.create({
      name: 'Compare scores',
      agentId: agent.id,
      configurationIds: [first.id, second.id],
      taskSuiteIds: [],
      taskIds: [city.id, greeting.id],
    });
    await tasks.update(city.id, {
      scoringCriteria: [
        {
          id: 'changed',
          type: 'output_contains',
          weight: 1,
          required: true,
          params: { text: 'this text is not in the snapshot' },
        },
      ],
    });

    execute.mockImplementation(async (request) => {
      if (request.prompt === 'Say hello.') {
        return success('hello');
      }
      if (request.systemPrompt === 'Reply with JSON.') {
        return success('not json');
      }
      return success('{"city":"Paris"}');
    });
    await execution.start(created.id);
    await waitUntil(async () => (await experiments.get(created.id)).status === 'COMPLETED');

    const summary = await evaluation.summary(created.id);
    expect(summary).toMatchObject({
      planned: 4,
      completedRuns: 4,
      failedRuns: 0,
      evaluatedRuns: 4,
      passedEvaluations: 3,
      failedEvaluations: 1,
      notEvaluated: 0,
      notEvaluable: 0,
      averageScore: 0.75,
      passRate: 0.75,
    });
    const comparison = await evaluation.comparison(created.id);
    expect(comparison.configurations.map((item) => [item.averageScore, item.passRate])).toEqual([
      [1, 1],
      [0.5, 0.5],
    ]);
    expect(comparison.tasks.map((task) => task.scores.map((score) => score.score))).toEqual([
      [1, 0],
      [1, 1],
    ]);
    const stored = await prisma.evaluation.findMany();
    expect(stored).toHaveLength(4);
    const cityRun = await prisma.run.findFirst({
      where: {
        experimentTask: { taskId: city.id },
        experimentConfigurationId: created.configurations[0]?.id,
      },
      include: { evaluation: true },
    });
    expect(cityRun?.evaluation?.criterionResults).toEqual([
      expect.objectContaining({ id: 'city', passed: true, type: 'json_field_equals' }),
    ]);

    await evaluation.evaluate(created.id, false);
    expect(await prisma.evaluation.count()).toBe(4);

    const before = cityRun?.evaluation?.id;
    await evaluation.evaluate(created.id, true);
    const after = await prisma.evaluation.findUnique({ where: { runId: cityRun!.id } });
    expect(await prisma.evaluation.count()).toBe(4);
    expect(after?.id).toBe(before);
  });

  it('does not evaluate a failed run and reports a missing evaluation after deletion', async () => {
    const agent = await agents.create({ ...agentInput, name: 'Timeout agent' });
    await agents.updateDraftConfig(agent.id, publishedDraft('Reply briefly.'));
    const published = await agents.publish(agent.id);
    const city = await tasks.create(cityTask('What city is the Eiffel Tower in?'));
    const greeting = await tasks.create(greetingTask());
    const created = await experiments.create({
      name: 'One failure',
      agentId: agent.id,
      configurationIds: [published.id],
      taskSuiteIds: [],
      taskIds: [city.id, greeting.id],
    });
    execute.mockImplementation(async (request) => {
      if (request.prompt === cityTask('What city is the Eiffel Tower in?').input) {
        return { ...success(''), timedOut: true, exitCode: null, stdout: '' };
      }
      return success('hello');
    });

    await execution.start(created.id);
    await waitUntil(async () => (await experiments.get(created.id)).status === 'COMPLETED');

    const runs = await prisma.run.findMany({ include: { evaluation: true, experimentTask: true } });
    const timedOut = runs.find((run) => run.status === 'TIMED_OUT');
    const completed = runs.find((run) => run.status === 'COMPLETED');
    expect(timedOut?.evaluation).toBeNull();
    expect(completed?.evaluation?.passed).toBe(true);
    expect(await evaluation.summary(created.id)).toMatchObject({
      completedRuns: 1,
      failedRuns: 1,
      evaluatedRuns: 1,
      notEvaluated: 0,
      averageScore: 1,
      passRate: 1,
    });

    await prisma.evaluation.deleteMany();
    expect(await evaluation.summary(created.id)).toMatchObject({
      evaluatedRuns: 0,
      notEvaluated: 1,
      averageScore: null,
      passRate: null,
    });
    const comparison = await evaluation.comparison(created.id);
    expect(comparison.tasks.map((task) => task.scores[0]?.score)).toEqual([null, null]);

    await evaluation.evaluate(created.id, false);
    expect(await prisma.evaluation.count()).toBe(1);
    await expect(evaluation.getForRun(timedOut!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const stored = await evaluation.getForRun(completed!.id);
    expect(stored.score).toBe(1);
    expect(stored.passed).toBe(true);
  });

  it('leaves a tool-only task without a score', async () => {
    const agent = await agents.create({ ...agentInput, name: 'Tool agent' });
    await agents.updateDraftConfig(agent.id, publishedDraft('Reply briefly.'));
    const published = await agents.publish(agent.id);
    const toolTask = await tasks.create({
      name: 'Tool check',
      input: 'Use search.',
      expectedOutcome: null,
      scoringCriteria: [
        {
          id: 'search',
          type: 'tool_called',
          weight: 1,
          required: true,
          params: { toolName: 'search' },
        },
      ],
      tags: [],
    });
    const created = await experiments.create({
      name: 'Unsupported criteria',
      agentId: agent.id,
      configurationIds: [published.id],
      taskSuiteIds: [],
      taskIds: [toolTask.id],
    });
    execute.mockResolvedValue(success('I searched.'));
    await execution.start(created.id);
    await waitUntil(async () => (await experiments.get(created.id)).status === 'COMPLETED');
    expect(await prisma.evaluation.count()).toBe(0);
    expect(await evaluation.summary(created.id)).toMatchObject({
      completedRuns: 1,
      evaluatedRuns: 0,
      notEvaluable: 1,
      notEvaluated: 0,
      averageScore: null,
    });
  });

  it('evaluates JSON extracted from the task snapshot schema', async () => {
    const agent = await agents.create({ ...agentInput, name: 'Schema agent' });
    await agents.updateDraftConfig(agent.id, publishedDraft('Reply briefly.'));
    const published = await agents.publish(agent.id);
    const schema = {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    };
    const city = await tasks.create({
      ...cityTask('What city is the Eiffel Tower in?'),
      outputSchema: schema,
    });
    const created = await experiments.create({
      name: 'Structured city',
      agentId: agent.id,
      configurationIds: [published.id],
      taskSuiteIds: [],
      taskIds: [city.id],
    });
    await tasks.update(city.id, {
      outputSchema: {
        type: 'object',
        properties: { country: { type: 'string' } },
        required: ['country'],
        additionalProperties: false,
      },
    });
    execute.mockResolvedValue(success('The city follows.\n\n```json\n{"city":"Paris"}\n```'));

    await execution.start(created.id);
    await waitUntil(async () => (await experiments.get(created.id)).status === 'COMPLETED');

    const request = execute.mock.calls.at(-1)?.[0];
    expect(request?.prompt).toContain('What city is the Eiffel Tower in?');
    expect(request?.prompt).toContain('"city"');
    expect(request?.prompt).not.toContain('Paris');
    expect(request?.prompt).not.toContain('country');
    expect(request?.systemPrompt).toBe('Reply briefly.');

    const stored = await prisma.evaluation.findFirstOrThrow();
    expect(stored.score).toBe(1);
    expect(stored.passed).toBe(true);
    const run = await execution.getRun(stored.runId);
    expect(run.finalOutput).toContain('```json');
    expect(run.structuredOutput).toMatchObject({
      parsed: true,
      schemaValid: true,
      extracted: { city: 'Paris' },
      validationErrors: [],
    });
    expect(run.finalOutput).not.toBe('{"city":"Paris"}');
  });

  it('does not score a completed run whose response misses the output schema', async () => {
    const agent = await agents.create({ ...agentInput, name: 'Invalid schema agent' });
    await agents.updateDraftConfig(agent.id, publishedDraft('Reply briefly.'));
    const published = await agents.publish(agent.id);
    const city = await tasks.create({
      ...cityTask('What city is the Eiffel Tower in?'),
      outputSchema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    });
    const created = await experiments.create({
      name: 'Invalid structured city',
      agentId: agent.id,
      configurationIds: [published.id],
      taskSuiteIds: [],
      taskIds: [city.id],
    });
    execute.mockResolvedValueOnce(success('Paris.\n')).mockResolvedValueOnce(success('{"city":1}'));

    await execution.start(created.id);
    await waitUntil(async () => (await experiments.get(created.id)).status === 'COMPLETED');
    expect(await prisma.evaluation.count()).toBe(0);
    expect(await evaluation.summary(created.id)).toMatchObject({
      completedRuns: 1,
      evaluatedRuns: 0,
      notEvaluable: 1,
      notEvaluated: 0,
    });
    const prose = await prisma.run.findFirstOrThrow();
    expect((await execution.getRun(prose.id)).structuredOutput?.parseError).toBe(
      'No JSON object was found in the response.',
    );

    await prisma.evaluation.deleteMany();
    await prisma.run.deleteMany();
    execute.mockResolvedValue(success('{"city":1}'));
    const second = await experiments.create({
      name: 'Wrong type',
      agentId: agent.id,
      configurationIds: [published.id],
      taskSuiteIds: [],
      taskIds: [city.id],
    });
    await execution.start(second.id);
    await waitUntil(async () => (await experiments.get(second.id)).status === 'COMPLETED');
    expect(await prisma.evaluation.count()).toBe(0);
    const mismatched = await prisma.run.findFirstOrThrow({ where: { experimentId: second.id } });
    const detail = await execution.getRun(mismatched.id);
    expect(detail.structuredOutput?.parsed).toBe(true);
    expect(detail.structuredOutput?.schemaValid).toBe(false);
    expect(detail.structuredOutput?.validationErrors.length).toBeGreaterThan(0);
  });
});

function cityTask(input: string): TaskCreateRequest {
  return {
    name: 'Extract city',
    input,
    expectedOutcome: { city: 'Paris' },
    scoringCriteria: [
      {
        id: 'city',
        type: 'json_field_equals',
        weight: 1,
        required: true,
        params: { path: 'city', expected: 'Paris' },
      },
    ],
    tags: ['geography'],
  };
}

function greetingTask(): TaskCreateRequest {
  return {
    name: 'Greeting',
    input: 'Say hello.',
    expectedOutcome: { text: 'hello' },
    scoringCriteria: [
      {
        id: 'greeting',
        type: 'output_contains',
        weight: 1,
        required: true,
        params: { text: 'hello', caseSensitive: true },
      },
    ],
    tags: [],
  };
}

function publishedDraft(systemPrompt: string): AgentDraftConfig {
  return { ...draftConfig, profileId: 'eval-base', systemPrompt };
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
