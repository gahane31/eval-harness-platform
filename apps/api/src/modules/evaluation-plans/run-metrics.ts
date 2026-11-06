import type { Prisma } from '../../generated/prisma/client';
import type { CostSummary } from '@eval/shared';

const EXECUTION_FAILURE = new Set(['FAILED', 'TIMED_OUT', 'CANCELLED']);
const ACCEPTED_COST = new Set(['actual', 'estimated', 'included']);

export interface RunMetricSource {
  status: string;
  usage: Prisma.JsonValue | null;
  evaluation: { passed: boolean } | null;
}

export interface RunMetrics {
  passRate: number | null;
  passedTestCases: number;
  completedTestCases: number;
  failedRuns: number;
  cost: CostSummary;
}

export function summarizeRuns(runs: RunMetricSource[]): RunMetrics {
  const completed = runs.filter((run) => run.status === 'COMPLETED');
  const passed = completed.filter((run) => run.evaluation?.passed === true).length;
  const costs = runs.flatMap((run) => {
    const cost = readRunCost(run.usage);
    return cost ? [cost] : [];
  });
  const total = costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost.amount, 0);
  return {
    passRate: completed.length === 0 ? null : passed / completed.length,
    passedTestCases: passed,
    completedTestCases: completed.length,
    failedRuns: runs.filter((run) => EXECUTION_FAILURE.has(run.status)).length,
    cost: {
      total,
      costedRuns: costs.length,
      runs: runs.length,
      estimated:
        total !== null && (costs.length < runs.length || costs.some((cost) => !cost.actual)),
    },
  };
}

export function thresholdMet(passRate: number | null, threshold: number | null): boolean | null {
  if (threshold === null || passRate === null) {
    return null;
  }
  return passRate + 1e-9 >= threshold;
}

export function readRunCost(
  usage: Prisma.JsonValue | null,
): { amount: number; actual: boolean } | null {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null;
  }
  const record = usage as Record<string, Prisma.JsonValue | undefined>;
  const amount = record.estimated_cost_usd;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return null;
  }
  const status = record.cost_status;
  if (
    status !== undefined &&
    status !== null &&
    (typeof status !== 'string' || !ACCEPTED_COST.has(status))
  ) {
    return null;
  }
  return { amount, actual: status === 'actual' };
}

export function localDayRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function percentLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
