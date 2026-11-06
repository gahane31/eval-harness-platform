import type { INestApplication } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';
import { createTestApp, resetDatabase } from '../../test/create-test-app';

describe('database constraints', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces configuration, run, event, and evaluation uniqueness', async () => {
    const agent = await prisma.agent.create({
      data: { name: 'Agent', draftConfig: { provider: 'openai' } },
    });
    await prisma.agentConfiguration.create({
      data: {
        agentId: agent.id,
        version: 1,
        configHash: 'hash-a',
        configSnapshot: { provider: 'openai' },
      },
    });

    await expect(
      prisma.agentConfiguration.create({
        data: {
          agentId: agent.id,
          version: 1,
          configHash: 'hash-b',
          configSnapshot: { provider: 'openai' },
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await expect(
      prisma.agentConfiguration.create({
        data: {
          agentId: agent.id,
          version: 2,
          configHash: 'hash-a',
          configSnapshot: { provider: 'openai' },
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    const configuration = await prisma.agentConfiguration.findFirstOrThrow();
    const task = await prisma.task.create({
      data: {
        name: 'Task',
        input: 'Say hello',
        expectedOutcome: { text: 'hello' },
        scoringCriteria: [],
      },
    });
    const experiment = await prisma.experiment.create({
      data: {
        agentId: agent.id,
        name: 'Experiment',
        repetitions: 2,
        concurrency: 1,
        timeoutSeconds: 30,
        passThreshold: 0.5,
      },
    });
    const experimentConfiguration = await prisma.experimentConfiguration.create({
      data: {
        experimentId: experiment.id,
        agentConfigurationId: configuration.id,
        label: 'Baseline',
        displayOrder: 0,
      },
    });
    await expect(
      prisma.experimentConfiguration.create({
        data: {
          experimentId: experiment.id,
          agentConfigurationId: configuration.id,
          label: 'Duplicate',
          displayOrder: 1,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    const experimentTask = await prisma.experimentTask.create({
      data: {
        experimentId: experiment.id,
        taskId: task.id,
        executionOrder: 0,
        taskSnapshot: {
          input: task.input,
          expectedOutcome: { text: 'hello' },
          scoringCriteria: [],
        },
      },
    });
    const run = await prisma.run.create({
      data: {
        experimentId: experiment.id,
        experimentConfigurationId: experimentConfiguration.id,
        experimentTaskId: experimentTask.id,
        repetitionIndex: 0,
      },
    });
    await expect(
      prisma.run.create({
        data: {
          experimentId: experiment.id,
          experimentConfigurationId: experimentConfiguration.id,
          experimentTaskId: experimentTask.id,
          repetitionIndex: 0,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await prisma.executionEvent.create({
      data: {
        runId: run.id,
        sequence: 0,
        eventType: 'message',
        rawEvent: { type: 'message' },
        timestamp: new Date(),
      },
    });
    await expect(
      prisma.executionEvent.create({
        data: {
          runId: run.id,
          sequence: 0,
          eventType: 'message',
          rawEvent: { type: 'duplicate' },
          timestamp: new Date(),
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await prisma.evaluation.create({
      data: {
        runId: run.id,
        score: 1,
        passed: true,
        criterionResults: [],
        evaluatedAt: new Date(),
      },
    });
    await expect(
      prisma.evaluation.create({
        data: {
          runId: run.id,
          score: 0,
          passed: false,
          criterionResults: [],
          evaluatedAt: new Date(),
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('rejects dangling references and cascading deletes of historical rows', async () => {
    const agent = await prisma.agent.create({
      data: { name: 'Agent', draftConfig: {} },
    });
    const configuration = await prisma.agentConfiguration.create({
      data: {
        agentId: agent.id,
        version: 1,
        configHash: 'hash-a',
        configSnapshot: {},
      },
    });
    const task = await prisma.task.create({
      data: {
        name: 'Task',
        input: 'Say hello',
        expectedOutcome: Prisma.JsonNull,
        scoringCriteria: [],
      },
    });
    const experiment = await prisma.experiment.create({
      data: {
        agentId: agent.id,
        name: 'Experiment',
        repetitions: 1,
        concurrency: 1,
        timeoutSeconds: 30,
        passThreshold: 1,
      },
    });
    await prisma.experimentConfiguration.create({
      data: {
        experimentId: experiment.id,
        agentConfigurationId: configuration.id,
        label: 'Baseline',
        displayOrder: 0,
      },
    });
    await prisma.experimentTask.create({
      data: {
        experimentId: experiment.id,
        taskId: task.id,
        executionOrder: 0,
        taskSnapshot: {
          input: 'Say hello',
          expectedOutcome: null,
          scoringCriteria: [],
        },
      },
    });

    await expect(
      prisma.experimentConfiguration.create({
        data: {
          experimentId: experiment.id,
          agentConfigurationId: '33333333-3333-4333-8333-333333333333',
          label: 'Missing',
          displayOrder: 1,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await expect(
      prisma.agentConfiguration.delete({ where: { id: configuration.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(prisma.task.delete({ where: { id: task.id } })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it('rejects scores and thresholds outside the normalized range', async () => {
    const agent = await prisma.agent.create({
      data: { name: 'Agent', draftConfig: {} },
    });
    await expect(
      prisma.experiment.create({
        data: {
          agentId: agent.id,
          name: 'Too confident',
          repetitions: 1,
          concurrency: 1,
          timeoutSeconds: 30,
          passThreshold: 1.5,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.experiment.create({
        data: {
          agentId: agent.id,
          name: 'No repetitions',
          repetitions: 0,
          concurrency: 1,
          timeoutSeconds: 30,
          passThreshold: 0.5,
        },
      }),
    ).rejects.toThrow();
  });
});
