import { jsonValueSchema, type JsonValue, type ScoringCriterion } from '@eval/shared';

const TEXT_CRITERIA = new Set(['exact_match', 'output_contains', 'output_not_contains']);
const SUPPORTED = new Set([
  'exact_match',
  'output_contains',
  'output_not_contains',
  'json_field_equals',
  'numeric_comparison',
]);

export interface CriterionEvaluation {
  id: string;
  type: string;
  applicable: boolean;
  passed: boolean | null;
  weight: number;
  required: boolean;
  expected: JsonValue | null;
  actual: JsonValue | null;
  explanation: string;
}

export interface OutputEvaluation {
  evaluable: boolean;
  score: number | null;
  passed: boolean | null;
  criterionResults: CriterionEvaluation[];
}

export function hasScorableCriteria(criteria: ScoringCriterion[]): boolean {
  return criteria.some((criterion) => SUPPORTED.has(criterion.type) && criterion.weight > 0);
}

export function evaluateOutput(
  output: string,
  criteria: ScoringCriterion[],
  passThreshold: number,
  structured?: unknown,
): OutputEvaluation {
  const criterionResults = criteria.map((criterion) =>
    evaluateCriterion(output, criterion, structured),
  );
  const weighted = criterionResults.filter(
    (result) => result.applicable && result.passed !== null && result.weight > 0,
  );
  if (weighted.length === 0) {
    return { evaluable: false, score: null, passed: null, criterionResults };
  }

  const totalWeight = weighted.reduce((sum, result) => sum + result.weight, 0);
  const passedWeight = weighted.reduce(
    (sum, result) => sum + (result.passed ? result.weight : 0),
    0,
  );
  const score = clampScore(passedWeight / totalWeight);
  const requiredFailed = criterionResults.some(
    (result) => result.applicable && result.required && result.passed === false,
  );
  return {
    evaluable: true,
    score,
    passed: score >= passThreshold && !requiredFailed,
    criterionResults,
  };
}

function evaluateCriterion(
  output: string,
  criterion: ScoringCriterion,
  structured: unknown,
): CriterionEvaluation {
  const base = {
    id: criterion.id,
    type: criterion.type,
    weight: criterion.weight,
    required: criterion.required,
  };
  if (!SUPPORTED.has(criterion.type)) {
    return {
      ...base,
      applicable: false,
      passed: null,
      expected: expectedForUnsupported(criterion),
      actual: null,
      explanation: unsupportedExplanation(criterion.type),
    };
  }

  if (criterion.type === 'exact_match') {
    const passed = sameText(output, criterion.params.expected, criterion.params.caseSensitive);
    return textResult(
      base,
      passed,
      criterion.params.expected,
      output,
      passed ? 'Output matches the expected text.' : 'Output does not match the expected text.',
    );
  }
  if (criterion.type === 'output_contains') {
    const passed = containsText(output, criterion.params.text, criterion.params.caseSensitive);
    return textResult(
      base,
      passed,
      criterion.params.text,
      output,
      passed ? 'Output contains the expected text.' : 'Output does not contain the expected text.',
    );
  }
  if (criterion.type === 'output_not_contains') {
    const passed = !containsText(output, criterion.params.text, criterion.params.caseSensitive);
    return textResult(
      base,
      passed,
      criterion.params.text,
      output,
      passed ? 'Output does not contain the excluded text.' : 'Output contains the excluded text.',
    );
  }
  if (criterion.type === 'json_field_equals') {
    return jsonFieldResult(
      base,
      output,
      criterion.params.path,
      criterion.params.expected,
      structured,
    );
  }
  if (criterion.type === 'numeric_comparison') {
    return numericResult(base, output, criterion, structured);
  }
  return {
    ...base,
    applicable: false,
    passed: null,
    expected: expectedForUnsupported(criterion),
    actual: null,
    explanation: unsupportedExplanation(criterion.type),
  };
}

function textResult(
  base: Pick<CriterionEvaluation, 'id' | 'type' | 'weight' | 'required'>,
  passed: boolean,
  expected: string,
  output: string,
  explanation: string,
): CriterionEvaluation {
  return {
    ...base,
    applicable: true,
    passed,
    expected,
    actual: clip(output),
    explanation,
  };
}

function jsonFieldResult(
  base: Pick<CriterionEvaluation, 'id' | 'type' | 'weight' | 'required'>,
  output: string,
  path: string,
  expected: JsonValue,
  structured: unknown,
): CriterionEvaluation {
  const parsed = parseJson(output, structured);
  if (!parsed.ok) {
    return {
      ...base,
      applicable: true,
      passed: false,
      expected,
      actual: clip(output),
      explanation: 'The output is not JSON.',
    };
  }
  const read = readPath(parsed.value, path);
  if (!read.found) {
    return {
      ...base,
      applicable: true,
      passed: false,
      expected,
      actual: null,
      explanation: 'The JSON field is missing.',
    };
  }
  const actual = jsonValue(read.value);
  const passed = sameJson(read.value, expected);
  return {
    ...base,
    applicable: true,
    passed,
    expected,
    actual,
    explanation: passed
      ? 'The JSON field matches the expected value.'
      : 'The JSON field does not match the expected value.',
  };
}

function numericResult(
  base: Pick<CriterionEvaluation, 'id' | 'type' | 'weight' | 'required'>,
  output: string,
  criterion: Extract<ScoringCriterion, { type: 'numeric_comparison' }>,
  structured: unknown,
): CriterionEvaluation {
  const expected = criterion.params.expected;
  const tolerance = criterion.params.tolerance ?? 0;
  const read = readNumeric(output, criterion.params.path, structured);
  if (!read.ok) {
    return {
      ...base,
      applicable: true,
      passed: false,
      expected,
      actual: read.actual,
      explanation: read.explanation,
    };
  }
  const passed = compareNumber(criterion.params.operator, read.value, expected, tolerance);
  return {
    ...base,
    applicable: true,
    passed,
    expected,
    actual: read.value,
    explanation: passed
      ? 'The number meets the comparison.'
      : 'The number does not meet the comparison.',
  };
}

function readNumeric(
  output: string,
  path: string | undefined,
  structured: unknown,
): { ok: true; value: number } | { ok: false; actual: JsonValue | null; explanation: string } {
  if (path === undefined) {
    const value = Number(output.trim());
    if (!Number.isFinite(value)) {
      return { ok: false, actual: clip(output), explanation: 'The output is not a number.' };
    }
    return { ok: true, value };
  }
  const parsed = parseJson(output, structured);
  if (!parsed.ok) {
    return { ok: false, actual: clip(output), explanation: 'The output is not JSON.' };
  }
  const read = readPath(parsed.value, path);
  if (!read.found || typeof read.value !== 'number' || !Number.isFinite(read.value)) {
    return {
      ok: false,
      actual: read.found ? jsonValue(read.value) : null,
      explanation: 'The JSON field is not a number.',
    };
  }
  return { ok: true, value: read.value };
}

function compareNumber(
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte',
  actual: number,
  expected: number,
  tolerance: number,
): boolean {
  const difference = actual - expected;
  if (operator === 'eq') {
    return Math.abs(difference) <= tolerance;
  }
  if (operator === 'neq') {
    return Math.abs(difference) > tolerance;
  }
  if (operator === 'gt') {
    return difference > tolerance;
  }
  if (operator === 'gte') {
    return difference >= -tolerance;
  }
  if (operator === 'lt') {
    return difference < -tolerance;
  }
  return difference <= tolerance;
}

function sameText(output: string, expected: string, caseSensitive: boolean | undefined): boolean {
  if (caseSensitive === false) {
    return output.toLowerCase() === expected.toLowerCase();
  }
  return output === expected;
}

function containsText(output: string, text: string, caseSensitive: boolean | undefined): boolean {
  if (caseSensitive === false) {
    return output.toLowerCase().includes(text.toLowerCase());
  }
  return output.includes(text);
}

function parseJson(
  output: string,
  structured: unknown,
): { ok: true; value: unknown } | { ok: false } {
  if (structured !== undefined) {
    return { ok: true, value: structured };
  }
  try {
    return { ok: true, value: JSON.parse(output.trim()) as unknown };
  } catch {
    return { ok: false };
  }
}

function readPath(value: unknown, path: string): { found: boolean; value: unknown } {
  let current = value;
  for (const part of path.split('.')) {
    if (part.length === 0) {
      return { found: false, value: undefined };
    }
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      const index = Number(part);
      if (index >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[index];
      continue;
    }
    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      const record = current as Record<string, unknown>;
      if (!Object.hasOwn(record, part)) {
        return { found: false, value: undefined };
      }
      current = record[part];
      continue;
    }
    return { found: false, value: undefined };
  }
  return { found: true, value: current };
}

function sameJson(actual: unknown, expected: JsonValue): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function jsonValue(value: unknown): JsonValue | null {
  const parsed = jsonValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function clip(value: string): string {
  return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
}

function clampScore(score: number): number {
  if (score < 0) {
    return 0;
  }
  if (score > 1) {
    return 1;
  }
  return score;
}

function expectedForUnsupported(criterion: ScoringCriterion): JsonValue | null {
  if (TEXT_CRITERIA.has(criterion.type)) {
    return null;
  }
  if (criterion.type === 'json_schema_valid') {
    return criterion.params.schema;
  }
  if (
    criterion.type === 'tool_called' ||
    criterion.type === 'tool_not_called' ||
    criterion.type === 'tool_execution_succeeded'
  ) {
    return criterion.params.toolName;
  }
  return null;
}

function unsupportedExplanation(type: string): string {
  if (type === 'json_schema_valid') {
    return 'JSON Schema criteria are not evaluated. This application does not include a JSON Schema validator.';
  }
  return 'Tool criteria are not evaluated. The run does not store a tool trace.';
}
