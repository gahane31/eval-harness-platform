import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { evaluationPlanWriteSchema, type EvaluationPlanWrite } from '@eval/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlansService } from './plans.service';

@Controller('evaluation-plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(evaluationPlanWriteSchema)) body: EvaluationPlanWrite) {
    return this.plans.create(body);
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(z.uuid())) id: string) {
    return this.plans.get(id);
  }

  @Put(':id')
  update(
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @Body(new ZodValidationPipe(evaluationPlanWriteSchema)) body: EvaluationPlanWrite,
  ) {
    return this.plans.update(id, body);
  }
}
