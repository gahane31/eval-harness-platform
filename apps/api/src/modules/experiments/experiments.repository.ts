import { Injectable } from '@nestjs/common';
import type { ExperimentTaskSnapshot } from '@eval/shared';
import { Prisma } from '../../generated/prisma/client';
import { toInputJson } from '../../database/json';
import { PrismaService } from '../../database/prisma.service';

const experimentInclude = {
  include: {
    agent: true,
    configurations: {
      orderBy: { displayOrder: 'asc' as const },
      include: { agentConfiguration: true },
    },
    experimentTasks: {
      orderBy: { executionOrder: 'asc' as const },
    },
  },
} satisfies Prisma.ExperimentDefaultArgs;

export type ExperimentRecord = Prisma.ExperimentGetPayload<typeof experimentInclude>;

export interface ExperimentConfigurationWrite {
  agentConfigurationId: string;
  label: string;
  displayOrder: number;
}

export interface ExperimentTaskWrite {
  taskId: string;
  executionOrder: number;
  taskSnapshot: ExperimentTaskSnapshot;
}

export interface ExperimentWrite {
  name: string;
  description: string | null;
  taskSuiteIds: string[];
  configurations: ExperimentConfigurationWrite[];
  tasks: ExperimentTaskWrite[];
}

const DRAFT_LIMITS = {
  repetitions: 1,
  concurrency: 1,
  timeoutSeconds: 1,
  passThreshold: 1,
} as const;

@Injectable()
export class ExperimentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(agentId: string, input: ExperimentWrite): Promise<ExperimentRecord> {
    return this.prisma.experiment.create({
      ...experimentInclude,
      data: {
        agentId,
        name: input.name,
        description: input.description,
        status: 'DRAFT',
        ...DRAFT_LIMITS,
        taskSuiteIds: toInputJson(input.taskSuiteIds),
        configurations: { create: input.configurations },
        experimentTasks: { create: this.taskCreates(input.tasks) },
      },
    });
  }

  replace(id: string, input: ExperimentWrite): Promise<ExperimentRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.experimentConfiguration.deleteMany({ where: { experimentId: id } });
      await tx.experimentTask.deleteMany({ where: { experimentId: id } });
      return tx.experiment.update({
        ...experimentInclude,
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          taskSuiteIds: toInputJson(input.taskSuiteIds),
          configurations: { create: input.configurations },
          experimentTasks: { create: this.taskCreates(input.tasks) },
        },
      });
    });
  }

  findById(id: string): Promise<ExperimentRecord | null> {
    return this.prisma.experiment.findUnique({ ...experimentInclude, where: { id } });
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<{ items: ExperimentRecord[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.experiment.findMany({
        ...experimentInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.experiment.count(),
    ]);
    return { items, total };
  }

  findAgent(id: string) {
    return this.prisma.agent.findUnique({ where: { id }, select: { id: true, name: true } });
  }

  findConfigurations(ids: string[]) {
    return this.prisma.agentConfiguration.findMany({ where: { id: { in: ids } } });
  }

  findSuites(ids: string[]) {
    return this.prisma.taskSuite.findMany({
      where: { id: { in: ids } },
      include: { tasks: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
  }

  findTasks(ids: string[]) {
    return this.prisma.task.findMany({ where: { id: { in: ids } } });
  }

  findSuitesByIds(ids: string[]) {
    return this.prisma.taskSuite.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, description: true },
    });
  }

  async claimDraft(id: string): Promise<boolean> {
    const result = await this.prisma.experiment.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    return result.count === 1;
  }

  async completeRunning(id: string): Promise<void> {
    await this.prisma.experiment.updateMany({
      where: { id, status: 'RUNNING' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  private taskCreates(tasks: ExperimentTaskWrite[]) {
    return tasks.map((task) => ({
      taskId: task.taskId,
      executionOrder: task.executionOrder,
      taskSnapshot: toInputJson(task.taskSnapshot),
    }));
  }
}
