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
import type { AgentCreateRequest, AgentDraftConfig, AgentUpdateRequest } from './dto/agent.dto';
import {
  agentCreateRequestSchema,
  agentDraftConfigSchema,
  agentUpdateRequestSchema,
} from './schemas/agent.schema';
import { AgentsService } from './agents.service';

const entityIdSchema = z.uuid();

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.agentsService.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(agentCreateRequestSchema)) body: AgentCreateRequest) {
    return this.agentsService.create(body);
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(entityIdSchema)) id: string) {
    return this.agentsService.get(id);
  }

  @Put(':id')
  update(
    @Param('id', new ZodValidationPipe(entityIdSchema)) id: string,
    @Body(new ZodValidationPipe(agentUpdateRequestSchema)) body: AgentUpdateRequest,
  ) {
    return this.agentsService.update(id, body);
  }

  @Put(':id/configuration')
  updateConfiguration(
    @Param('id', new ZodValidationPipe(entityIdSchema)) id: string,
    @Body(new ZodValidationPipe(agentDraftConfigSchema)) body: AgentDraftConfig,
  ) {
    return this.agentsService.updateDraftConfig(id, body);
  }
}
