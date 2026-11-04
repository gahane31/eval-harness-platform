import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  agentDraftConfigSchema,
  agentResponseSchema,
  ErrorCode,
  type AgentResponse,
} from '@eval/shared';
import type { Agent } from '../../generated/prisma/client';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class AgentMapper {
  private readonly logger = new Logger(AgentMapper.name);

  toResponse(agent: Agent): AgentResponse {
    const draftConfig = agentDraftConfigSchema.safeParse(agent.draftConfig);
    if (!draftConfig.success) {
      this.logger.error(`Stored draft configuration for agent ${agent.id} is invalid.`);
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored agent configuration is invalid.',
      );
    }

    const response = {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      draftConfig: draftConfig.data,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
    const parsed = agentResponseSchema.safeParse(response);
    if (!parsed.success) {
      this.logger.error(`Agent ${agent.id} could not be serialized.`);
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored agent configuration is invalid.',
      );
    }

    return parsed.data;
  }
}
