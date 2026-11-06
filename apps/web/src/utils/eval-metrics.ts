import type { RunDetail, RunSummary } from '../types';
import type { RunEvaluationView } from '../api/evaluations';

export const EXECUTION_FAILURE_STATUSES = new Set(['FAILED', 'TIMED_OUT', 'CANCELLED']);
const COSTED_STATUSES = new Set(['actual', 'estimated', 'included']);
const SCORE_EPSILON = 1e-9;

export type CaseOutcome =
  'improved' | 'regressed' | 'unchanged' | 'not_evaluated' | 'execution_failed' | 'pending';

export type RunOutcome = 'passed' | 'failed' | 'not_evaluated' | 'execution_failed' | 'pending';

export interface CostSummary {
  total: number | null;
  costedRuns: number;
  expectedRuns: number;
  complete: boolean;
  statuses: string[];
  sources: string[];
  allActual: boolean;
}

export function runOutcome(
  run: RunSummary | undefined,
  evaluation: RunEvaluationView | undefined,
): RunOutcome {
  if (!run || run.status === 'QUEUED' || run.status === 'RUNNING') {
    return 'pending';
  }
  if (EXECUTION_FAILURE_STATUSES.has(run.status)) {
    return 'execution_failed';
  }
  if (!evaluation) {
    return 'not_evaluated';
  }
  return evaluation.passed ? 'passed' : 'failed';
}

export function caseOutcome(
  baseline: { run: RunSummary | undefined; evaluation: RunEvaluationView | undefined },
  candidate: { run: RunSummary | undefined; evaluation: RunEvaluationView | undefined },
): CaseOutcome {
  const left = runOutcome(baseline.run, baseline.evaluation);
  const right = runOutcome(candidate.run, candidate.evaluation);
  if (left === 'pending' || right === 'pending') {
    return 'pending';
  }
  if (left === 'execution_failed' || right === 'execution_failed') {
    return 'execution_failed';
  }
  if (!baseline.evaluation || !candidate.evaluation) {
    return 'not_evaluated';
  }
  const difference = candidate.evaluation.score - baseline.evaluation.score;
  if (difference > SCORE_EPSILON) {
    return 'improved';
  }
  if (difference < -SCORE_EPSILON) {
    return 'regressed';
  }
  if (baseline.evaluation.passed !== candidate.evaluation.passed) {
    return candidate.evaluation.passed ? 'improved' : 'regressed';
  }
  return 'unchanged';
}

export function runCost(detail: RunDetail | undefined): number | null {
  const usage = detail?.usage;
  if (!usage) {
    return null;
  }
  const amount = usage.estimated_cost_usd;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return null;
  }
  if (usage.cost_status !== undefined && !COSTED_STATUSES.has(usage.cost_status)) {
    return null;
  }
  return amount;
}

export function summarizeCost(details: Array<RunDetail | undefined>, expectedRuns: number) {
  let total = 0;
  let costedRuns = 0;
  const statuses = new Set<string>();
  const sources = new Set<string>();
  for (const detail of details) {
    const amount = runCost(detail);
    if (amount === null) {
      continue;
    }
    total += amount;
    costedRuns += 1;
    if (detail?.usage?.cost_status) {
      statuses.add(detail.usage.cost_status);
    }
    if (detail?.usage?.cost_source) {
      sources.add(detail.usage.cost_source);
    }
  }
  const summary: CostSummary = {
    total: costedRuns > 0 ? total : null,
    costedRuns,
    expectedRuns,
    complete: expectedRuns > 0 && costedRuns === expectedRuns,
    statuses: [...statuses].sort(),
    sources: [...sources].sort(),
    allActual: statuses.size === 1 && statuses.has('actual'),
  };
  return summary;
}

export function averageDuration(runs: RunSummary[]): { average: number; count: number } | null {
  const durations = runs.flatMap((run) =>
    run.status === 'COMPLETED' && run.durationMs !== null ? [run.durationMs] : [],
  );
  if (durations.length === 0) {
    return null;
  }
  return {
    average: durations.reduce((sum, value) => sum + value, 0) / durations.length,
    count: durations.length,
  };
}

export interface PairedComparison {
  pairs: number;
  scoreDelta: number | null;
  passRateDelta: number | null;
  baselinePassRate: number | null;
  candidatePassRate: number | null;
}

export function pairedComparison(
  pairs: Array<{ baseline: RunEvaluationView; candidate: RunEvaluationView }>,
): PairedComparison {
  if (pairs.length === 0) {
    return {
      pairs: 0,
      scoreDelta: null,
      passRateDelta: null,
      baselinePassRate: null,
      candidatePassRate: null,
    };
  }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const baselinePassRate = pairs.filter((pair) => pair.baseline.passed).length / pairs.length;
  const candidatePassRate = pairs.filter((pair) => pair.candidate.passed).length / pairs.length;
  return {
    pairs: pairs.length,
    scoreDelta:
      mean(pairs.map((pair) => pair.candidate.score)) -
      mean(pairs.map((pair) => pair.baseline.score)),
    passRateDelta: candidatePassRate - baselinePassRate,
    baselinePassRate,
    candidatePassRate,
  };
}

export function costCaption(
  cost: {
    total: number | null;
    costedRuns: number;
    runs: number;
    estimated: boolean;
  } | null,
): string {
  if (!cost || (cost.total === null && cost.runs === 0)) {
    return '—';
  }
  if (cost.total === null) {
    return 'Cost unavailable';
  }
  const kind = cost.estimated ? 'Estimated' : 'Actual';
  const coverage = cost.costedRuns < cost.runs ? ` · ${cost.costedRuns} of ${cost.runs} runs` : '';
  return `${formatUsd(cost.total)} · ${kind}${coverage}`;
}

export function formatUsd(value: number | null): string {
  if (value === null) {
    return 'Cost unavailable';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 5 : 4,
  }).format(value);
}

export function formatScore(score: number | null | undefined): string {
  return score === null || score === undefined ? '—' : score.toFixed(2);
}

export function formatSignedScore(delta: number | null): string {
  if (delta === null) {
    return '—';
  }
  if (Math.abs(delta) < SCORE_EPSILON) {
    return '0.00';
  }
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}`;
}

export function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
}

export function formatPoints(delta: number | null): string {
  if (delta === null) {
    return '—';
  }
  const points = Math.round(delta * 100);
  if (points === 0) {
    return '0 pp';
  }
  return `${points > 0 ? '+' : '−'}${Math.abs(points)} pp`;
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) {
    return '—';
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatTokens(value: number | undefined): string {
  return value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
}

export const CASE_OUTCOME_LABELS: Record<CaseOutcome, string> = {
  improved: 'Improved',
  regressed: 'Regressed',
  unchanged: 'Unchanged',
  not_evaluated: 'Not evaluated',
  execution_failed: 'Execution failed',
  pending: 'Pending',
};

export const CASE_OUTCOME_TONES: Record<
  CaseOutcome,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  improved: 'success',
  regressed: 'danger',
  unchanged: 'neutral',
  not_evaluated: 'warning',
  execution_failed: 'danger',
  pending: 'info',
};

export const RUN_OUTCOME_LABELS: Record<RunOutcome, string> = {
  passed: 'Passed',
  failed: 'Failed',
  not_evaluated: 'Not evaluated',
  execution_failed: 'Execution failed',
  pending: 'Pending',
};

export const RUN_OUTCOME_TONES: Record<
  RunOutcome,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  passed: 'success',
  failed: 'danger',
  not_evaluated: 'warning',
  execution_failed: 'danger',
  pending: 'info',
};

export const EVAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export const EVAL_STATUS_TONES: Record<
  string,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  DRAFT: 'neutral',
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'warning',
};
