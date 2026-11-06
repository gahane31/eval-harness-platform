import { Injectable } from '@nestjs/common';
import type { TaskCreateRequest, TaskUpdateRequest } from '@eval/shared';
import { Prisma, type Task } from '../../generated/prisma/client';
import { toInputJson } from '../../database/json';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: TaskCreateRequest): Promise<Task> {
    return this.prisma.task.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        input: input.input,
        expectedOutcome: toInputJson(input.expectedOutcome),
        scoringCriteria: toInputJson(input.scoringCriteria),
        outputSchema: storedOutputSchema(input.outputSchema),
        version: 1,
        tags: toInputJson(input.tags),
      },
    });
  }

  findById(id: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  async list(page: number, pageSize: number): Promise<{ items: Task[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.task.count(),
    ]);

    return { items, total };
  }

  update(id: string, input: TaskUpdateRequest, version: number): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.input !== undefined ? { input: input.input } : {}),
        ...(input.expectedOutcome !== undefined
          ? { expectedOutcome: toInputJson(input.expectedOutcome) }
          : {}),
        ...(input.scoringCriteria !== undefined
          ? { scoringCriteria: toInputJson(input.scoringCriteria) }
          : {}),
        ...(input.outputSchema !== undefined
          ? { outputSchema: storedOutputSchema(input.outputSchema) }
          : {}),
        ...(input.tags !== undefined ? { tags: toInputJson(input.tags) } : {}),
        version,
      },
    });
  }
}

function storedOutputSchema(value: TaskCreateRequest['outputSchema']) {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  return toInputJson(value);
}
