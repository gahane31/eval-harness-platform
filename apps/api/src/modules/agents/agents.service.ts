import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AgentConfigurationVersion,
  type AgentCreateRequest,
  type AgentDraftConfig,
  type AgentResponse,
  type StoredAgentDraftConfig,
  type AgentUpdateRequest,
  type ConfigurationValidation,
  type PaginationQuery,
  type PublishConfigurationResponse,
} from '@eval/shared';
import { stableConfigHash } from '../../common/utils/canonical-json';
import { AppException } from '../../common/exceptions/app.exception';
import { buildPagination, Paginated } from '../../common/utils/pagination';
import { AGENT_RUNTIME, type AgentRuntime } from '../runtime/agent-runtime';
import { AgentMapper } from './agents.mapper';
import { AgentsRepository } from './agents.repository';

@Injectable()
export class AgentsService {
  constructor(
    private readonly agentsRepository: AgentsRepository,
    private readonly agentMapper: AgentMapper,
    @Inject(AGENT_RUNTIME) private readonly runtime: AgentRuntime,
  ) {}

  async create(input: AgentCreateRequest): Promise<AgentResponse> {
    const agent = await this.agentsRepository.create(input);
    return this.agentMapper.toResponse(agent);
  }

  async list(query: PaginationQuery): Promise<Paginated<AgentResponse>> {
    const { items, total } = await this.agentsRepository.list(query.page, query.pageSize);
    return new Paginated(
      items.map((agent) => this.agentMapper.toResponse(agent)),
      buildPagination(query.page, query.pageSize, total),
    );
  }

  async get(id: string): Promise<AgentResponse> {
    const agent = await this.requireAgent(id);
    return this.agentMapper.toResponse(agent);
  }

  async update(id: string, input: AgentUpdateRequest): Promise<AgentResponse> {
    await this.requireAgent(id);
    const agent = await this.agentsRepository.update(id, input);
    return this.agentMapper.toResponse(agent);
  }

  /**
   * Replaces the editable draft. This does not publish an immutable AgentConfiguration version.
   */
  async updateDraftConfig(id: string, draftConfig: AgentDraftConfig): Promise<AgentResponse> {
    await this.requireAgent(id);
    const agent = await this.agentsRepository.updateDraftConfig(id, draftConfig);
    return this.agentMapper.toResponse(agent);
  }

  async validateDraft(id: string): Promise<ConfigurationValidation> {
    const agent = await this.requireAgent(id);
    const draft = this.agentMapper.toResponse(agent).draftConfig;
    const configured = draftWithProfile(draft);
    if (!configured) {
      return missingProfileValidation();
    }
    return this.runtime.validateConfiguration(configured.draft, { profile: configured.profileId });
  }

  async publish(id: string): Promise<PublishConfigurationResponse> {
    const agent = await this.requireAgent(id);
    const configured = draftWithProfile(this.agentMapper.toResponse(agent).draftConfig);
    if (!configured) {
      throw validationException(missingProfileValidation());
    }
    const validation = await this.runtime.validateConfiguration(configured.draft, {
      profile: configured.profileId,
    });
    if (!validation.valid) {
      throw validationException(validation);
    }

    const published = await this.agentsRepository.publish(
      id,
      configured.draft,
      stableConfigHash(configured.draft),
      validation.warnings,
    );
    return { ...this.agentMapper.toVersion(published.record), reused: published.reused };
  }

  async listVersions(
    id: string,
    query: PaginationQuery,
  ): Promise<Paginated<AgentConfigurationVersion>> {
    await this.requireAgent(id);
    const { items, total } = await this.agentsRepository.listVersions(
      id,
      query.page,
      query.pageSize,
    );
    return new Paginated(
      items.map((item) => this.agentMapper.toVersion(item)),
      buildPagination(query.page, query.pageSize, total),
    );
  }

  async getVersion(id: string): Promise<AgentConfigurationVersion> {
    const configuration = await this.agentsRepository.findVersion(id);
    if (!configuration) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'Configuration version not found.',
      );
    }
    return this.agentMapper.toVersion(configuration);
  }

  private async requireAgent(id: string) {
    const agent = await this.agentsRepository.findById(id);
    if (!agent) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Agent not found.');
    }
    return agent;
  }
}

const MISSING_PROFILE_MESSAGE =
  'This draft has no stored profile. Save an explicit profile id before validation or publishing.';

function missingProfileValidation(): ConfigurationValidation {
  return {
    valid: false,
    errors: [
      {
        path: 'profileId',
        code: 'UNSUPPORTED_CAPABILITY',
        message: MISSING_PROFILE_MESSAGE,
      },
    ],
    warnings: [],
  };
}

function draftWithProfile(
  draft: StoredAgentDraftConfig,
): { draft: AgentDraftConfig; profileId: string } | null {
  if (!draft.profileId) {
    return null;
  }
  return { draft: { ...draft, profileId: draft.profileId }, profileId: draft.profileId };
}

function validationException(validation: ConfigurationValidation): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_ERROR,
    'Configuration cannot be published.',
    validation.errors.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
    })),
  );
}
