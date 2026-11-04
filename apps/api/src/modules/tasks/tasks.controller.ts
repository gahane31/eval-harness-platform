import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { paginationQuerySchema, type PaginationQuery } from '@eval/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { TaskCreateRequest, TaskUpdateRequest } from './dto/task.dto';
import { taskCreateRequestSchema, taskUpdateRequestSchema } from './schemas/task.schema';
import { TasksService } from './tasks.service';

const entityIdSchema = z.uuid();

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.tasksService.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(taskCreateRequestSchema)) body: TaskCreateRequest) {
    return this.tasksService.create(body);
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(entityIdSchema)) id: string) {
    return this.tasksService.get(id);
  }

  @Put(':id')
  update(
    @Param('id', new ZodValidationPipe(entityIdSchema)) id: string,
    @Body(new ZodValidationPipe(taskUpdateRequestSchema)) body: TaskUpdateRequest,
  ) {
    return this.tasksService.update(id, body);
  }
}
