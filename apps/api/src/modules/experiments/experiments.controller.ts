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
import {
  evaluateRequestSchema,
  experimentCreateRequestSchema,
  experimentUpdateRequestSchema,
  paginationQuerySchema,
  type EvaluateRequest,
  type ExperimentCreateRequest,
  type ExperimentUpdateRequest,
  type PaginationQuery,
} from '@eval/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { EvaluationService } from './evaluation.service';
import { ExecutionService } from './execution.service';
import { ExperimentsService } from './experiments.service';

const entityIdSchema = z.uuid();

@Controller('experiments')
export class ExperimentsController {
  constructor(
    private readonly experimentsService: ExperimentsService,
    private readonly executionService: ExecutionService,
    private readonly evaluationService: EvaluationService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.experimentsService.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(experimentCreateRequestSchema)) body: ExperimentCreateRequest,
  ) {
    return this.experimentsService.create(body);
  }

  @Post(':id/start')
  start(@Param('id', new ZodValidationPipe(entityIdSchema)) id: string) {
    return this.executionService.start(id);
  }

  @Get(':id/execution')
  execution(@Param('id', new ZodValidationPipe(entityIdSchema)) id: string) {
    return this.executionService.getExecution(id);
  }

  @Get(':id/runs')
  runs(@Param('id', new ZodValidationPipe(entityIdSchema)) id: string) {
    return this.executionService.listRuns(id);
  }

  @Post(':id/evaluate')
  evaluate(
    @Param('id', new ZodValidationPipe(entityIdSchema)) id: string,
    @Body(new ZodValidationPipe(evaluateRequestSchema)) body: EvaluateRequest,
  ) {
    return this.evaluationService.evaluate(id, body.reevaluate === true);
  }

  @Get(':id/evaluation')
  evaluation(@Param('id', new ZodValidationPipe(entityIdSchema)) id: string) {
    return this.evaluationService.summary(id);
  }

  @Get(':id/comparison')
  comparison(@Param('id', new ZodValidationPipe(entityIdSchema)) id: string) {
    return this.evaluationService.comparison(id);
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(entityIdSchema)) id: string) {
    return this.experimentsService.get(id);
  }

  @Put(':id')
  update(
    @Param('id', new ZodValidationPipe(entityIdSchema)) id: string,
    @Body(new ZodValidationPipe(experimentUpdateRequestSchema)) body: ExperimentUpdateRequest,
  ) {
    return this.experimentsService.update(id, body);
  }
}
