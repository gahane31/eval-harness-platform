import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  jsonValueSchema,
  scoringCriteriaSchema,
  taskResponseSchema,
  type TaskResponse,
} from '@eval/shared';
import type { Task } from '../../generated/prisma/client';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class TaskMapper {
  private readonly logger = new Logger(TaskMapper.name);

  toResponse(task: Task): TaskResponse {
    const expectedOutcome = jsonValueSchema.safeParse(task.expectedOutcome);
    const scoringCriteria = scoringCriteriaSchema.safeParse(task.scoringCriteria);
    const tags = scoringTags(task.tags);

    if (!expectedOutcome.success || !scoringCriteria.success || !tags.success) {
      this.logger.error(`Stored task ${task.id} failed contract validation.`);
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored task is invalid.',
      );
    }

    const response = {
      id: task.id,
      name: task.name,
      description: task.description,
      input: task.input,
      expectedOutcome: expectedOutcome.data,
      scoringCriteria: scoringCriteria.data,
      version: task.version,
      tags: tags.data,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
    const parsed = taskResponseSchema.safeParse(response);
    if (!parsed.success) {
      this.logger.error(`Task ${task.id} could not be serialized.`);
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored task is invalid.',
      );
    }

    return parsed.data;
  }
}

function scoringTags(value: unknown): { success: true; data: string[] } | { success: false } {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return { success: false };
  }
  return { success: true, data: value };
}
