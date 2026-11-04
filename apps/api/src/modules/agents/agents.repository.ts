import { Injectable } from '@nestjs/common';
import type { AgentCreateRequest, AgentDraftConfig, AgentUpdateRequest } from '@eval/shared';
import type { Agent } from '../../generated/prisma/client';
import { toInputJson } from '../../database/json';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AgentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: AgentCreateRequest): Promise<Agent> {
    return this.prisma.agent.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        draftConfig: toInputJson(input.draftConfig),
      },
    });
  }

  findById(id: string): Promise<Agent | null> {
    return this.prisma.agent.findUnique({ where: { id } });
  }

  async list(page: number, pageSize: number): Promise<{ items: Agent[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agent.count(),
    ]);

    return { items, total };
  }

  update(id: string, input: AgentUpdateRequest): Promise<Agent> {
    return this.prisma.agent.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
  }

  updateDraftConfig(id: string, draftConfig: AgentDraftConfig): Promise<Agent> {
    return this.prisma.agent.update({
      where: { id },
      data: { draftConfig: toInputJson(draftConfig) },
    });
  }
}
