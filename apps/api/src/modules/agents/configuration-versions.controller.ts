import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgentsService } from './agents.service';

@Controller('configuration-versions')
export class ConfigurationVersionsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get(':versionId')
  get(@Param('versionId', new ZodValidationPipe(z.uuid())) versionId: string) {
    return this.agentsService.getVersion(versionId);
  }
}
