import { Injectable } from '@nestjs/common';
import type { TaskSuiteCreateRequest, TaskSuiteUpdateRequest } from '@eval/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

const suiteWithCount = {
  include: {
    _count: { select: { tasks: true } },
  },
} satisfies Prisma.TaskSuiteDefaultArgs;

const suiteWithTasks = {
  include: {
    _count: { select: { tasks: true } },
    tasks: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  },
} satisfies Prisma.TaskSuiteDefaultArgs;

export type TaskSuiteRecord = Prisma.TaskSuiteGetPayload<typeof suiteWithCount>;
export type TaskSuiteDetailRecord = Prisma.TaskSuiteGetPayload<typeof suiteWithTasks>;

@Injectable()
export class TaskSuitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(agentId: string, input: TaskSuiteCreateRequest): Promise<TaskSuiteRecord> {
    return this.prisma.taskSuite.create({
      ...suiteWithCount,
      data: {
        agentId,
        name: input.name,
        description: input.description ?? null,
      },
    });
  }

  async list(
    agentId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: TaskSuiteRecord[]; total: number }> {
    const where = { agentId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.taskSuite.findMany({
        ...suiteWithCount,
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.taskSuite.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<TaskSuiteDetailRecord | null> {
    return this.prisma.taskSuite.findUnique({ ...suiteWithTasks, where: { id } });
  }

  update(id: string, input: TaskSuiteUpdateRequest): Promise<TaskSuiteDetailRecord> {
    return this.prisma.taskSuite.update({
      ...suiteWithTasks,
      where: { id },
      data: {
        name: input.name,
        description: input.description ?? null,
      },
    });
  }

  delete(id: string): Promise<void> {
    return this.prisma.taskSuite.delete({ where: { id } }).then(() => undefined);
  }

  replaceTasks(suiteId: string, taskIds: string[]): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { taskSuiteId: suiteId },
        data: { taskSuiteId: null },
      });
      if (taskIds.length > 0) {
        await tx.task.updateMany({
          where: { id: { in: taskIds } },
          data: { taskSuiteId: suiteId },
        });
      }
    });
  }

  findTasks(taskIds: string[]) {
    return this.prisma.task.findMany({ where: { id: { in: taskIds } } });
  }
}
