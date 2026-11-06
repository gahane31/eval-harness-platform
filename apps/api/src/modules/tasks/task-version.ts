import type { TaskUpdateRequest } from '@eval/shared';

export interface TaskEvaluationContent {
  input: string;
  expectedOutcome: unknown;
  scoringCriteria: unknown;
  outputSchema: unknown;
}

export function nextTaskVersion(
  currentVersion: number,
  current: TaskEvaluationContent,
  update: TaskUpdateRequest,
): number {
  return evaluationContentChanged(current, update) ? currentVersion + 1 : currentVersion;
}

function evaluationContentChanged(
  current: TaskEvaluationContent,
  update: TaskUpdateRequest,
): boolean {
  if (update.input !== undefined && update.input !== current.input) {
    return true;
  }
  if (
    update.expectedOutcome !== undefined &&
    !sameJsonValue(update.expectedOutcome, current.expectedOutcome)
  ) {
    return true;
  }
  if (
    update.scoringCriteria !== undefined &&
    !sameJsonValue(update.scoringCriteria, current.scoringCriteria)
  ) {
    return true;
  }
  if (
    update.outputSchema !== undefined &&
    !sameJsonValue(update.outputSchema, current.outputSchema)
  ) {
    return true;
  }
  return false;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}
