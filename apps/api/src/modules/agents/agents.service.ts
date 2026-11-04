import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AgentCreateRequest,
  type AgentDraftConfig,
  type AgentResponse,
  type AgentUpdateRequest,
  type PaginationQuery,
} from '@eval/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { buildPagination, Paginated } from '../../common/utils/pagination';
import { AgentMapper } from './agents.mapper';
import { AgentsRepository } from './agents.repository';

@Injectable()
export class AgentsService {
  constructor(
    private readonly agentsRepository: AgentsRepository,
    private readonly agentMapper: AgentMapper,
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

  private async requireAgent(id: string) {
    const agent = await this.agentsRepository.findById(id);
    if (!agent) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Agent not found.');
    }
    return agent;
  }
}
