import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  agentConfigurationVersionSchema,
  agentResponseSchema,
  storedAgentDraftConfigSchema,
  configurationIssueSchema,
  ErrorCode,
  type AgentConfigurationVersion,
  type AgentResponse,
} from '@eval/shared';
import type { AgentConfiguration } from '../../generated/prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import type { AgentRecord } from './agents.repository';

@Injectable()
export class AgentMapper {
  private readonly logger = new Logger(AgentMapper.name);

  toResponse(agent: AgentRecord): AgentResponse {
    const draftConfig = storedAgentDraftConfigSchema.safeParse(agent.draftConfig);
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
      publishedVersionCount: agent._count.configurations,
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

  toVersion(configuration: AgentConfiguration): AgentConfigurationVersion {
    const snapshot = storedAgentDraftConfigSchema.safeParse(configuration.configSnapshot);
    const warnings = configurationIssueSchema
      .array()
      .safeParse(configuration.publishWarnings ?? []);
    if (!snapshot.success || !warnings.success) {
      this.logger.error(`Stored configuration version ${configuration.id} is invalid.`);
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored agent configuration is invalid.',
      );
    }

    const parsed = agentConfigurationVersionSchema.safeParse({
      id: configuration.id,
      agentId: configuration.agentId,
      version: configuration.version,
      configSnapshot: snapshot.data,
      configHash: configuration.configHash,
      warnings: warnings.data,
      createdAt: configuration.createdAt.toISOString(),
    });
    if (!parsed.success) {
      this.logger.error(`Configuration version ${configuration.id} could not be serialized.`);
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored agent configuration is invalid.',
      );
    }
    return parsed.data;
  }
}
