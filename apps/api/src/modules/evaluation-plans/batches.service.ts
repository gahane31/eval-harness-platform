import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, evaluationBatchSchema, type EvaluationBatch } from '@eval/shared';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';
import { ExecutionService } from '../experiments/execution.service';
import { ExperimentsService } from '../experiments/experiments.service';
import { summarizeRuns, thresholdMet, type RunMetrics } from './run-metrics';

const batchInclude = {
  include: {
    items: {
      orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      include: {
        resolvedVersion: { select: { version: true, agentId: true } },
        experiment: {
          include: {
            runs: { include: { evaluation: { select: { passed: true } } } },
          },
        },
      },
    },
  },
} satisfies Prisma.EvaluationBatchDefaultArgs;

type BatchRecord = Prisma.EvaluationBatchGetPayload<typeof batchInclude>;
type ItemRecord = BatchRecord['items'][number];

interface ResolvedEntry {
  entryId: string;
  planName: string;
  agentId: string;
  agentName: string;
  suiteId: string;
  suiteName: string;
  versionId: string;
  passRateThreshold: number | null;
}

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly experiments: ExperimentsService,
    private readonly execution: ExecutionService,
  ) {}

  async start(): Promise<EvaluationBatch> {
    const resolved = await this.resolveEnabledEntries();
    if (resolved.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'There are no enabled evaluation plan entries to run.',
      );
    }
    const batch = await this.createRunningBatch();
    try {
      for (const entry of resolved) {
        await this.startEntry(batch.id, entry);
      }
    } catch (error) {
      const started = await this.prisma.evaluationBatchItem.count({ where: { batchId: batch.id } });
      if (started === 0) {
        await this.prisma.evaluationBatch.update({
          where: { id: batch.id },
          data: { status: 'FAILED', runningKey: null, completedAt: new Date() },
        });
      }
      throw error;
    }
    return this.get(batch.id);
  }

  async get(id: string): Promise<EvaluationBatch> {
    await this.reconcile(id);
    const batch = await this.prisma.evaluationBatch.findUnique({ ...batchInclude, where: { id } });
    if (!batch) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Batch not found.');
    }
    return this.toView(batch);
  }

  async currentOrLatest(): Promise<EvaluationBatch | null> {
    const running = await this.prisma.evaluationBatch.findFirst({
      where: { status: 'RUNNING' },
      select: { id: true },
    });
    if (running) {
      return this.get(running.id);
    }
    const latest = await this.prisma.evaluationBatch.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    return latest ? this.get(latest.id) : null;
  }

  private async startEntry(batchId: string, entry: ResolvedEntry): Promise<void> {
    const experiment = await this.experiments.create({
      name: clip(`${entry.agentName} — ${entry.suiteName}`, 200),
      description: clip(`Evaluation plan: ${entry.planName}`, 5_000),
      agentId: entry.agentId,
      configurationIds: [entry.versionId],
      taskSuiteIds: [entry.suiteId],
      taskIds: [],
    });
    const item = await this.prisma.evaluationBatchItem.create({
      data: {
        batchId,
        planEntryId: entry.entryId,
        resolvedVersionId: entry.versionId,
        experimentId: experiment.id,
        taskSuiteId: entry.suiteId,
        taskSuiteName: entry.suiteName,
        agentName: entry.agentName,
        passRateThreshold: entry.passRateThreshold,
        status: 'PENDING',
      },
    });
    try {
      await this.execution.start(experiment.id);
      await this.prisma.evaluationBatchItem.update({
        where: { id: item.id },
        data: { status: 'RUNNING' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Evaluation could not be started.';
      this.logger.warn(message);
      await this.prisma.evaluationBatchItem.update({
        where: { id: item.id },
        data: { status: 'FAILED' },
      });
    }
  }

  private async createRunningBatch() {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const running = await tx.evaluationBatch.findFirst({
          where: { status: 'RUNNING' },
          select: { id: true },
        });
        if (running) {
          throw this.conflict();
        }
        return tx.evaluationBatch.create({
          data: {
            name: batchName(new Date()),
            status: 'RUNNING',
            runningKey: 'RUNNING',
            startedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.conflict();
      }
      throw error;
    }
  }

  private async resolveEnabledEntries(): Promise<ResolvedEntry[]> {
    const plans = await this.prisma.evaluationPlan.findMany({
      where: { enabled: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        entries: {
          where: { enabled: true },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          include: {
            agent: {
              include: { configurations: { orderBy: { version: 'desc' }, take: 1 } },
            },
            pinnedVersion: { select: { id: true, agentId: true } },
            taskSuite: { include: { _count: { select: { tasks: true } } } },
          },
        },
      },
    });
    const resolved: ResolvedEntry[] = [];
    const problems: string[] = [];
    for (const plan of plans) {
      for (const entry of plan.entries) {
        if (entry.taskSuite.agentId !== entry.agentId) {
          problems.push(`Task suite "${entry.taskSuite.name}" is not part of ${entry.agent.name}.`);
          continue;
        }
        if (entry.taskSuite._count.tasks === 0) {
          problems.push(`Task suite "${entry.taskSuite.name}" has no test cases.`);
          continue;
        }
        const versionId =
          entry.versionPolicy === 'PINNED'
            ? entry.pinnedVersion?.agentId === entry.agentId
              ? entry.pinnedVersion.id
              : null
            : (entry.agent.configurations[0]?.id ?? null);
        if (!versionId) {
          problems.push(
            entry.versionPolicy === 'PINNED'
              ? `Pinned version for ${entry.agent.name} is not available.`
              : `${entry.agent.name} has no published configuration.`,
          );
          continue;
        }
        resolved.push({
          entryId: entry.id,
          planName: plan.name,
          agentId: entry.agentId,
          agentName: entry.agent.name,
          suiteId: entry.taskSuite.id,
          suiteName: entry.taskSuite.name,
          versionId,
          passRateThreshold: entry.passRateThreshold,
        });
      }
    }
    if (problems.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        problems.join(' '),
      );
    }
    return resolved;
  }

  private async reconcile(id: string): Promise<void> {
    const batch = await this.prisma.evaluationBatch.findUnique({ ...batchInclude, where: { id } });
    if (!batch || batch.status === 'FAILED') {
      return;
    }
    for (const item of batch.items) {
      const next = itemStatus(item);
      if (next === item.status) {
        continue;
      }
      await this.prisma.evaluationBatchItem.update({
        where: { id: item.id },
        data: { status: next },
      });
      item.status = next;
    }
    const stillRunning = batch.items.some(
      (item) => item.status === 'PENDING' || item.status === 'RUNNING',
    );
    const nextStatus = stillRunning ? 'RUNNING' : 'COMPLETED';
    if (nextStatus === batch.status) {
      return;
    }
    await this.prisma.evaluationBatch.update({
      where: { id },
      data: {
        status: nextStatus,
        runningKey: nextStatus === 'RUNNING' ? 'RUNNING' : null,
        completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
      },
    });
  }

  private toView(batch: BatchRecord): EvaluationBatch {
    const itemViews = batch.items.map((item) => {
      const metrics = summarizeRuns(item.experiment.runs);
      return {
        id: item.id,
        experimentId: item.experimentId,
        agentId: item.experiment.agentId,
        agentName: item.agentName,
        versionId: item.resolvedVersionId,
        version: item.resolvedVersion.version,
        taskSuiteId: item.taskSuiteId,
        taskSuiteName: item.taskSuiteName,
        status: item.status,
        passRate: metrics.passRate,
        passedTestCases: metrics.passedTestCases,
        completedTestCases: metrics.completedTestCases,
        failedRuns: metrics.failedRuns,
        passRateThreshold: item.passRateThreshold,
        thresholdMet: thresholdMet(metrics.passRate, item.passRateThreshold),
        cost: metrics.cost,
      };
    });
    const totals = summarizeRuns(batch.items.flatMap((item) => item.experiment.runs));
    const counts = {
      total: itemViews.length,
      pending: itemViews.filter((item) => item.status === 'PENDING').length,
      running: itemViews.filter((item) => item.status === 'RUNNING').length,
      completed: itemViews.filter((item) => item.status === 'COMPLETED').length,
      failed: itemViews.filter((item) => item.status === 'FAILED').length,
    };
    const parsed = evaluationBatchSchema.safeParse({
      id: batch.id,
      name: batch.name,
      status: batch.status,
      startedAt: batch.startedAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null,
      counts,
      passRate: totals.passRate,
      passedTestCases: totals.passedTestCases,
      completedTestCases: totals.completedTestCases,
      cost: totals.cost,
      items: itemViews,
    });
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored evaluation batch is invalid.',
      );
    }
    return parsed.data;
  }

  private conflict(): AppException {
    return new AppException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, 'A batch is already running.');
  }
}

function itemStatus(item: ItemRecord): ItemRecord['status'] {
  const metrics: RunMetrics = summarizeRuns(item.experiment.runs);
  if (item.experiment.status === 'FAILED' || item.experiment.status === 'CANCELLED') {
    return 'FAILED';
  }
  if (item.experiment.status === 'COMPLETED') {
    if (metrics.completedTestCases === 0 && metrics.failedRuns > 0) {
      return 'FAILED';
    }
    return 'COMPLETED';
  }
  if (item.status === 'FAILED') {
    return 'FAILED';
  }
  if (item.experiment.status === 'RUNNING') {
    return 'RUNNING';
  }
  return item.status;
}

function batchName(now: Date): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  return `All evaluations · ${formatted}`;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
