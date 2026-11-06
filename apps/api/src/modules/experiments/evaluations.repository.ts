import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { toInputJson } from '../../database/json';
import { PrismaService } from '../../database/prisma.service';
import type { CriterionEvaluation } from './evaluate-output';

const evaluationRunInclude = {
  include: {
    evaluation: true,
    experimentTask: true,
    experimentConfiguration: { include: { agentConfiguration: true } },
  },
} satisfies Prisma.RunDefaultArgs;

export type EvaluationRunRecord = Prisma.RunGetPayload<typeof evaluationRunInclude>;

export interface EvaluationWrite {
  score: number;
  passed: boolean;
  criterionResults: CriterionEvaluation[];
}

@Injectable()
export class EvaluationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForExperiment(experimentId: string): Promise<EvaluationRunRecord[]> {
    return this.prisma.run.findMany({
      ...evaluationRunInclude,
      where: { experimentId },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });
  }

  findByRunId(runId: string) {
    return this.prisma.evaluation.findUnique({ where: { runId } });
  }

  create(runId: string, input: EvaluationWrite) {
    return this.prisma.evaluation.create({
      data: {
        runId,
        score: input.score,
        passed: input.passed,
        criterionResults: toInputJson(input.criterionResults),
        evaluatedAt: new Date(),
      },
    });
  }

  update(runId: string, input: EvaluationWrite) {
    return this.prisma.evaluation.update({
      where: { runId },
      data: {
        score: input.score,
        passed: input.passed,
        criterionResults: toInputJson(input.criterionResults),
        evaluatedAt: new Date(),
      },
    });
  }
}
