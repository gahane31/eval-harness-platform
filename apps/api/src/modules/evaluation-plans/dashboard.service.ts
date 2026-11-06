import { HttpStatus, Injectable } from '@nestjs/common';
import { dashboardSchema, ErrorCode, type Dashboard } from '@eval/shared';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';
import { BatchesService } from './batches.service';
import { PlansService } from './plans.service';
import { localDayRange, percentLabel, summarizeRuns, thresholdMet } from './run-metrics';

type AttentionItem = Dashboard['attention'][number];

const recentInclude = {
  agent: { select: { name: true } },
  configurations: {
    orderBy: { displayOrder: 'asc' as const },
    include: { agentConfiguration: { select: { version: true } } },
  },
  runs: { include: { evaluation: { select: { passed: true } } } },
} satisfies Prisma.ExperimentInclude;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly batches: BatchesService,
  ) {}

  async get(): Promise<Dashboard> {
    const { start, end } = localDayRange();
    const [agents, tasks, taskSuites, today, recent, plans, latestBatch] = await Promise.all([
      this.prisma.agent.count(),
      this.prisma.task.count(),
      this.prisma.taskSuite.count(),
      this.prisma.experiment.findMany({
        where: {
          OR: [{ startedAt: { gte: start, lt: end } }, { completedAt: { gte: start, lt: end } }],
        },
        select: {
          agentId: true,
          runs: {
            select: {
              status: true,
              usage: true,
              evaluation: { select: { passed: true } },
            },
          },
        },
      }),
      this.prisma.experiment.findMany({
        where: { status: { not: 'DRAFT' } },
        orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }],
        take: 8,
        include: recentInclude,
      }),
      this.plans.list(),
      this.batches.currentOrLatest(),
    ]);
    const todayRuns = today.flatMap((experiment) => experiment.runs);
    const todayMetrics = summarizeRuns(todayRuns);
    const runningExperimentIds = new Set(
      latestBatch?.status === 'RUNNING' ? latestBatch.items.map((item) => item.experimentId) : [],
    );
    const attention = await this.attention(runningExperimentIds);
    const parsed = dashboardSchema.safeParse({
      agents,
      tasks,
      taskSuites,
      evaluationsToday: today.length,
      agentsEvaluatedToday: new Set(today.map((experiment) => experiment.agentId)).size,
      passRateToday: today.length === 0 ? null : todayMetrics.passRate,
      passedTestCasesToday: today.length === 0 ? 0 : todayMetrics.passedTestCases,
      completedTestCasesToday: today.length === 0 ? 0 : todayMetrics.completedTestCases,
      costToday: today.length === 0 ? null : todayMetrics.cost,
      attention,
      recent: recent.map((experiment) => {
        const metrics = summarizeRuns(experiment.runs);
        const versions = experiment.configurations
          .map((configuration) => `Version ${configuration.agentConfiguration.version}`)
          .join(', ');
        return {
          id: experiment.id,
          name: experiment.name,
          agentName: experiment.agent.name,
          versions: versions.length > 0 ? versions : '—',
          status: experiment.status,
          passRate: metrics.passRate,
          passedTestCases: metrics.passedTestCases,
          completedTestCases: metrics.completedTestCases,
          failedRuns: metrics.failedRuns,
          cost: metrics.cost,
          completedAt: experiment.completedAt?.toISOString() ?? null,
        };
      }),
      plans,
      latestBatch,
    });
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Dashboard summary is invalid.',
      );
    }
    return parsed.data;
  }

  private async attention(runningExperimentIds: Set<string>): Promise<AttentionItem[]> {
    const [running, failed, items] = await Promise.all([
      this.prisma.experiment.findMany({
        where: { status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
        select: { id: true, name: true },
      }),
      this.prisma.experiment.findMany({
        where: { status: { in: ['FAILED', 'CANCELLED'] } },
        orderBy: { completedAt: 'desc' },
        take: 8,
        select: { id: true, name: true, status: true },
      }),
      this.prisma.evaluationBatchItem.findMany({
        orderBy: [{ batch: { startedAt: 'desc' } }, { createdAt: 'desc' }],
        take: 80,
        include: {
          experiment: {
            include: { runs: { include: { evaluation: { select: { passed: true } } } } },
          },
        },
      }),
    ]);
    const seen = new Set<string>();
    const result: AttentionItem[] = [];
    const add = (item: AttentionItem) => {
      if (seen.has(item.experimentId) || result.length >= 12) {
        return;
      }
      seen.add(item.experimentId);
      result.push(item);
    };

    for (const experiment of running) {
      if (runningExperimentIds.has(experiment.id)) {
        continue;
      }
      add({
        id: `running:${experiment.id}`,
        kind: 'running',
        title: experiment.name,
        detail: 'Running',
        experimentId: experiment.id,
      });
    }
    for (const experiment of failed) {
      add({
        id: `failed:${experiment.id}`,
        kind: 'failed',
        title: experiment.name,
        detail: experiment.status === 'CANCELLED' ? 'Cancelled' : 'Execution failed',
        experimentId: experiment.id,
      });
    }

    const latestByEntry = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const key = item.planEntryId ?? item.id;
      if (!latestByEntry.has(key)) {
        latestByEntry.set(key, item);
      }
    }
    for (const item of latestByEntry.values()) {
      const metrics = summarizeRuns(item.experiment.runs);
      const executionFailed =
        item.status === 'FAILED' ||
        item.experiment.status === 'FAILED' ||
        item.experiment.status === 'CANCELLED' ||
        (item.experiment.status === 'COMPLETED' &&
          metrics.completedTestCases === 0 &&
          metrics.failedRuns > 0);
      if (executionFailed) {
        add({
          id: `failed:${item.experimentId}`,
          kind: 'failed',
          title: item.experiment.name,
          detail: 'Execution failed',
          experimentId: item.experimentId,
        });
        continue;
      }
      const met = thresholdMet(metrics.passRate, item.passRateThreshold);
      if (met === false && metrics.passRate !== null && item.passRateThreshold !== null) {
        add({
          id: `threshold:${item.experimentId}`,
          kind: 'threshold',
          title: `${item.agentName} — ${item.taskSuiteName}`,
          detail: `Pass rate ${percentLabel(metrics.passRate)} is below ${percentLabel(item.passRateThreshold)}.`,
          experimentId: item.experimentId,
        });
      }
    }
    return result;
  }
}
