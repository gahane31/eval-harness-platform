import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  evaluationPlanSchema,
  type EvaluationPlan,
  type EvaluationPlanWrite,
} from '@eval/shared';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';

const planInclude = {
  include: {
    entries: {
      orderBy: [{ displayOrder: 'asc' as const }, { id: 'asc' as const }],
      include: {
        agent: { select: { name: true } },
        taskSuite: { select: { name: true, _count: { select: { tasks: true } } } },
        pinnedVersion: { select: { version: true } },
      },
    },
  },
} satisfies Prisma.EvaluationPlanDefaultArgs;

type PlanRecord = Prisma.EvaluationPlanGetPayload<typeof planInclude>;

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<EvaluationPlan[]> {
    const plans = await this.prisma.evaluationPlan.findMany({
      ...planInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return plans.map((plan) => this.toPlan(plan));
  }

  async get(id: string): Promise<EvaluationPlan> {
    const plan = await this.prisma.evaluationPlan.findUnique({ ...planInclude, where: { id } });
    if (!plan) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'Evaluation plan not found.',
      );
    }
    return this.toPlan(plan);
  }

  async create(input: EvaluationPlanWrite): Promise<EvaluationPlan> {
    await this.validate(input);
    const plan = await this.prisma.evaluationPlan.create({
      ...planInclude,
      data: {
        name: input.name,
        description: input.description ?? null,
        enabled: input.enabled,
        entries: { create: this.entryData(input) },
      },
    });
    return this.toPlan(plan);
  }

  async update(id: string, input: EvaluationPlanWrite): Promise<EvaluationPlan> {
    const existing = await this.prisma.evaluationPlan.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'Evaluation plan not found.',
      );
    }
    await this.validate(input);
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.evaluationPlanEntry.deleteMany({ where: { planId: id } });
      return tx.evaluationPlan.update({
        ...planInclude,
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          enabled: input.enabled,
          entries: { create: this.entryData(input) },
        },
      });
    });
    return this.toPlan(plan);
  }

  private entryData(input: EvaluationPlanWrite) {
    return input.entries.map((entry, displayOrder) => ({
      agentId: entry.agentId,
      versionPolicy: entry.versionPolicy,
      pinnedVersionId: entry.versionPolicy === 'PINNED' ? (entry.pinnedVersionId ?? null) : null,
      taskSuiteId: entry.taskSuiteId,
      displayOrder,
      enabled: entry.enabled,
      passRateThreshold: entry.passRateThreshold ?? null,
    }));
  }

  private async validate(input: EvaluationPlanWrite): Promise<void> {
    const seen = new Set<string>();
    const agentIds = [...new Set(input.entries.map((entry) => entry.agentId))];
    const agents =
      agentIds.length === 0
        ? []
        : await this.prisma.agent.findMany({
            where: { id: { in: agentIds } },
            include: {
              configurations: { select: { id: true } },
              taskSuites: { include: { _count: { select: { tasks: true } } } },
            },
          });
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));

    for (const [index, entry] of input.entries.entries()) {
      const path = `entries.${index}`;
      const key = `${entry.agentId}:${entry.taskSuiteId}`;
      if (seen.has(key)) {
        throw this.invalid(
          `${path}.taskSuiteId`,
          'Each agent and task suite can appear only once in a plan.',
        );
      }
      seen.add(key);
      const agent = agentsById.get(entry.agentId);
      if (!agent) {
        throw this.invalid(`${path}.agentId`, 'Agent not found.');
      }
      const suite = agent.taskSuites.find((item) => item.id === entry.taskSuiteId);
      if (!suite) {
        throw this.invalid(`${path}.taskSuiteId`, 'Task suite is not part of this agent.');
      }
      if (suite._count.tasks === 0) {
        throw this.invalid(`${path}.taskSuiteId`, `Task suite "${suite.name}" has no test cases.`);
      }
      if (entry.versionPolicy === 'PINNED') {
        if (!entry.pinnedVersionId) {
          throw this.invalid(`${path}.pinnedVersionId`, 'Choose a published version to pin.');
        }
        if (!agent.configurations.some((item) => item.id === entry.pinnedVersionId)) {
          throw this.invalid(
            `${path}.pinnedVersionId`,
            'Pinned version is not a published configuration of this agent.',
          );
        }
      } else if (entry.pinnedVersionId) {
        throw this.invalid(
          `${path}.pinnedVersionId`,
          'Latest published does not use a pinned version.',
        );
      } else if (agent.configurations.length === 0) {
        throw this.invalid(
          `${path}.agentId`,
          `Agent "${agent.name}" has no published configuration.`,
        );
      }
    }
  }

  private toPlan(plan: PlanRecord): EvaluationPlan {
    const parsed = evaluationPlanSchema.safeParse({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      enabled: plan.enabled,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      entries: plan.entries.map((entry) => ({
        id: entry.id,
        agentId: entry.agentId,
        agentName: entry.agent.name,
        versionPolicy: entry.versionPolicy,
        pinnedVersionId: entry.pinnedVersionId,
        pinnedVersion: entry.pinnedVersion?.version ?? null,
        taskSuiteId: entry.taskSuiteId,
        taskSuiteName: entry.taskSuite.name,
        taskCount: entry.taskSuite._count.tasks,
        enabled: entry.enabled,
        passRateThreshold: entry.passRateThreshold,
      })),
    });
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored evaluation plan is invalid.',
      );
    }
    return parsed.data;
  }

  private invalid(path: string, message: string): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, message, [
      { path, message },
    ]);
  }
}
