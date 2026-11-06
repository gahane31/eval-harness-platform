import { Injectable } from '@nestjs/common';
import type {
  AgentCreateRequest,
  AgentDraftConfig,
  AgentUpdateRequest,
  ConfigurationIssue,
} from '@eval/shared';
import { Prisma, type AgentConfiguration } from '../../generated/prisma/client';
import { toInputJson } from '../../database/json';
import { PrismaService } from '../../database/prisma.service';

const agentWithVersionCount = {
  include: {
    _count: { select: { configurations: true } },
  },
} satisfies Prisma.AgentDefaultArgs;

export type AgentRecord = Prisma.AgentGetPayload<typeof agentWithVersionCount>;

export interface PublishedConfiguration {
  record: AgentConfiguration;
  reused: boolean;
}

@Injectable()
export class AgentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: AgentCreateRequest): Promise<AgentRecord> {
    return this.prisma.agent.create({
      ...agentWithVersionCount,
      data: {
        name: input.name,
        description: input.description ?? null,
        draftConfig: toInputJson(input.draftConfig),
      },
    });
  }

  findById(id: string): Promise<AgentRecord | null> {
    return this.prisma.agent.findUnique({ where: { id }, ...agentWithVersionCount });
  }

  async list(page: number, pageSize: number): Promise<{ items: AgentRecord[]; total: number }> {
    const where = {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({
        ...agentWithVersionCount,
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agent.count({ where }),
    ]);
    return { items, total };
  }

  update(id: string, input: AgentUpdateRequest): Promise<AgentRecord> {
    return this.prisma.agent.update({
      ...agentWithVersionCount,
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
  }

  updateDraftConfig(id: string, draftConfig: AgentDraftConfig): Promise<AgentRecord> {
    return this.prisma.agent.update({
      ...agentWithVersionCount,
      where: { id },
      data: { draftConfig: toInputJson(draftConfig) },
    });
  }

  async publish(
    agentId: string,
    snapshot: AgentDraftConfig,
    configHash: string,
    warnings: ConfigurationIssue[],
  ): Promise<PublishedConfiguration> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.agentConfiguration.findUnique({
            where: { agentId_configHash: { agentId, configHash } },
          });
          if (existing) {
            return { record: existing, reused: true };
          }

          const latest = await tx.agentConfiguration.findFirst({
            where: { agentId },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const record = await tx.agentConfiguration.create({
            data: {
              agentId,
              version: (latest?.version ?? 0) + 1,
              configSnapshot: toInputJson(snapshot),
              configHash,
              publishWarnings: toInputJson(warnings),
            },
          });
          return { record, reused: false };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Configuration version could not be published.');
  }

  async listVersions(
    agentId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: AgentConfiguration[]; total: number }> {
    const where = { agentId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.agentConfiguration.findMany({
        where,
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agentConfiguration.count({ where }),
    ]);
    return { items, total };
  }

  findVersion(id: string): Promise<AgentConfiguration | null> {
    return this.prisma.agentConfiguration.findUnique({ where: { id } });
  }
}
