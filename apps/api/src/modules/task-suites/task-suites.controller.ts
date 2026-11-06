import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  paginationQuerySchema,
  taskSuiteCreateRequestSchema,
  taskSuiteTasksRequestSchema,
  taskSuiteUpdateRequestSchema,
  type PaginationQuery,
  type TaskSuiteCreateRequest,
  type TaskSuiteTasksRequest,
  type TaskSuiteUpdateRequest,
} from '@eval/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TaskSuitesService } from './task-suites.service';

const entityIdSchema = z.uuid();

@Controller('agents/:agentId/task-suites')
export class TaskSuitesController {
  constructor(private readonly taskSuitesService: TaskSuitesService) {}

  @Get()
  list(
    @Param('agentId', new ZodValidationPipe(entityIdSchema)) agentId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.taskSuitesService.list(agentId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('agentId', new ZodValidationPipe(entityIdSchema)) agentId: string,
    @Body(new ZodValidationPipe(taskSuiteCreateRequestSchema)) body: TaskSuiteCreateRequest,
  ) {
    return this.taskSuitesService.create(agentId, body);
  }

  @Get(':suiteId')
  get(
    @Param('agentId', new ZodValidationPipe(entityIdSchema)) agentId: string,
    @Param('suiteId', new ZodValidationPipe(entityIdSchema)) suiteId: string,
  ) {
    return this.taskSuitesService.get(agentId, suiteId);
  }

  @Put(':suiteId')
  update(
    @Param('agentId', new ZodValidationPipe(entityIdSchema)) agentId: string,
    @Param('suiteId', new ZodValidationPipe(entityIdSchema)) suiteId: string,
    @Body(new ZodValidationPipe(taskSuiteUpdateRequestSchema)) body: TaskSuiteUpdateRequest,
  ) {
    return this.taskSuitesService.update(agentId, suiteId, body);
  }

  @Put(':suiteId/tasks')
  replaceTasks(
    @Param('agentId', new ZodValidationPipe(entityIdSchema)) agentId: string,
    @Param('suiteId', new ZodValidationPipe(entityIdSchema)) suiteId: string,
    @Body(new ZodValidationPipe(taskSuiteTasksRequestSchema)) body: TaskSuiteTasksRequest,
  ) {
    return this.taskSuitesService.replaceTasks(agentId, suiteId, body);
  }

  @Delete(':suiteId')
  @HttpCode(HttpStatus.OK)
  delete(
    @Param('agentId', new ZodValidationPipe(entityIdSchema)) agentId: string,
    @Param('suiteId', new ZodValidationPipe(entityIdSchema)) suiteId: string,
  ) {
    return this.taskSuitesService.delete(agentId, suiteId);
  }
}
