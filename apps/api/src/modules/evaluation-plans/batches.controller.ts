import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BatchesService } from './batches.service';

@Controller('evaluation-batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  start() {
    return this.batches.start();
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(z.uuid())) id: string) {
    return this.batches.get(id);
  }
}
