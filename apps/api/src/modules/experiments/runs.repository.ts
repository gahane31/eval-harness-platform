import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { toInputJson } from '../../database/json';
import { PrismaService } from '../../database/prisma.service';
import type { HermesUsageReport } from './hermes-oneshot';

const runInclude = {
  include: {
    experimentConfiguration: { include: { agentConfiguration: true } },
    experimentTask: true,
  },
} satisfies Prisma.RunDefaultArgs;

export type RunRecord = Prisma.RunGetPayload<typeof runInclude>;

export interface RunFinish {
  status: 'COMPLETED' | 'FAILED' | 'TIMED_OUT';
  finalOutput: string | null;
  processExitCode: number | null;
  error: string | null;
  usage: HermesUsageReport | null;
  durationMs: number | null;
  hermesSessionId: string | null;
}

export interface RunCreate {
  experimentId: string;
  experimentConfigurationId: string;
  experimentTaskId: string;
  hermesProfile: string;
  runtimeSnapshot: Record<string, unknown>;
}

@Injectable()
export class RunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: RunCreate): Promise<RunRecord> {
    return this.prisma.run.create({
      ...runInclude,
      data: {
        experimentId: input.experimentId,
        experimentConfigurationId: input.experimentConfigurationId,
        experimentTaskId: input.experimentTaskId,
        repetitionIndex: 0,
        status: 'QUEUED',
        hermesProfile: input.hermesProfile,
        runtimeSnapshot: toInputJson(input.runtimeSnapshot),
      },
    });
  }

  markRunning(id: string): Promise<RunRecord> {
    return this.prisma.run.update({
      ...runInclude,
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
  }

  finish(id: string, input: RunFinish): Promise<RunRecord> {
    return this.prisma.run.update({
      ...runInclude,
      where: { id },
      data: {
        status: input.status,
        finalOutput: input.finalOutput,
        processExitCode: input.processExitCode,
        error: input.error,
        usage: input.usage === null ? Prisma.DbNull : toInputJson(input.usage),
        durationMs: input.durationMs,
        hermesSessionId: input.hermesSessionId,
        completedAt: new Date(),
      },
    });
  }

  listForExperiment(experimentId: string): Promise<RunRecord[]> {
    return this.prisma.run.findMany({
      ...runInclude,
      where: { experimentId },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });
  }

  findById(id: string): Promise<RunRecord | null> {
    return this.prisma.run.findUnique({ ...runInclude, where: { id } });
  }
}
