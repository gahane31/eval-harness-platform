import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { EvaluationService } from './evaluation.service';
import { ExecutionService } from './execution.service';

@Controller('runs')
export class RunsController {
  constructor(
    private readonly executionService: ExecutionService,
    private readonly evaluationService: EvaluationService,
  ) {}

  @Get(':id/evaluation')
  evaluation(@Param('id', new ZodValidationPipe(z.uuid())) id: string) {
    return this.evaluationService.getForRun(id);
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(z.uuid())) id: string) {
    return this.executionService.getRun(id);
  }
}
