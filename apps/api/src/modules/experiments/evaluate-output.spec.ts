import type { ScoringCriterion } from '@eval/shared';
import { evaluateOutput, hasScorableCriteria } from './evaluate-output';

const threshold = 1;

function criterion(
  type: ScoringCriterion['type'],
  params: ScoringCriterion['params'],
  extra?: Partial<Pick<ScoringCriterion, 'id' | 'weight' | 'required'>>,
): ScoringCriterion {
  return {
    id: extra?.id ?? type,
    type,
    weight: extra?.weight ?? 1,
    required: extra?.required ?? false,
    params,
  } as ScoringCriterion;
}

describe('evaluateOutput', () => {
  it('scores exact text, contained text, and excluded text', () => {
    const result = evaluateOutput(
      'Hello Paris',
      [
        criterion('exact_match', { expected: 'hello paris', caseSensitive: false }),
        criterion('output_contains', { text: 'Paris' }),
        criterion('output_not_contains', { text: 'London' }),
      ],
      threshold,
    );
    expect(result.evaluable).toBe(true);
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.criterionResults.map((item) => item.passed)).toEqual([true, true, true]);
  });

  it('keeps omitted case sensitivity strict', () => {
    const result = evaluateOutput(
      'Hello',
      [criterion('output_contains', { text: 'hello' })],
      threshold,
    );
    expect(result.criterionResults[0]).toMatchObject({
      passed: false,
      explanation: 'Output does not contain the expected text.',
    });
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('matches a JSON field and a numeric comparison', () => {
    const result = evaluateOutput(
      '{"city":"Paris","score":0.8}',
      [
        criterion('json_field_equals', { path: 'city', expected: 'Paris' }),
        criterion('numeric_comparison', {
          operator: 'gte',
          expected: 0.8,
          path: 'score',
          tolerance: 0.01,
        }),
      ],
      0.5,
    );
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('fails a JSON criterion when the output is prose', () => {
    const result = evaluateOutput(
      'Paris.\n',
      [
        criterion(
          'json_field_equals',
          { path: 'city', expected: 'Paris' },
          { id: 'city', required: true },
        ),
      ],
      threshold,
    );
    expect(result.criterionResults[0]).toMatchObject({
      id: 'city',
      passed: false,
      expected: 'Paris',
      explanation: 'The output is not JSON.',
    });
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('weights passed criteria and fails when a required criterion fails', () => {
    const result = evaluateOutput(
      'hello',
      [
        criterion(
          'output_contains',
          { text: 'hello' },
          { id: 'present', weight: 0.25, required: false },
        ),
        criterion(
          'exact_match',
          { expected: 'hello!' },
          { id: 'exact', weight: 0.75, required: true },
        ),
      ],
      0.2,
    );
    expect(result.score).toBe(0.25);
    expect(result.passed).toBe(false);
  });

  it('does not score tool or JSON Schema criteria', () => {
    const criteria = [
      criterion('tool_called', { toolName: 'search' }),
      criterion('json_schema_valid', { schema: { type: 'object' } }),
    ];
    expect(hasScorableCriteria(criteria)).toBe(false);
    const result = evaluateOutput('search', criteria, threshold);
    expect(result.evaluable).toBe(false);
    expect(result.score).toBeNull();
    expect(result.passed).toBeNull();
    expect(result.criterionResults.map((item) => item.applicable)).toEqual([false, false]);
  });

  it('excludes unsupported criteria from the score', () => {
    const result = evaluateOutput(
      'hello',
      [
        criterion('output_contains', { text: 'hello' }, { id: 'text' }),
        criterion('tool_not_called', { toolName: 'delete_file' }, { id: 'tool' }),
      ],
      threshold,
    );
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.criterionResults[1]).toMatchObject({
      id: 'tool',
      applicable: false,
      passed: null,
      expected: 'delete_file',
    });
  });
});
