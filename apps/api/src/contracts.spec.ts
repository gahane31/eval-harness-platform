import {
  agentDraftConfigSchema,
  storedAgentDraftConfigSchema,
  agentUpdateRequestSchema,
  experimentCreateRequestSchema,
  paginationQuerySchema,
  scoringCriterionSchema,
  taskCreateRequestSchema,
  taskUpdateRequestSchema,
} from '@eval/shared';
import { draftConfig } from '../test/fixtures';

describe('agent configuration schema', () => {
  it('accepts a structurally valid draft', () => {
    expect(agentDraftConfigSchema.parse(draftConfig)).toEqual(draftConfig);
  });

  it('allows an empty skill list and omits reasoning', () => {
    const parsed = agentDraftConfigSchema.parse({
      ...draftConfig,
      reasoning: undefined,
      skills: [],
      toolsets: [],
    });
    expect(parsed.reasoning).toBeUndefined();
    expect(parsed.skills).toEqual([]);
  });

  it('does not invent a profile id for an older draft', () => {
    const { profileId: _profileId, ...legacy } = draftConfig;
    expect(storedAgentDraftConfigSchema.parse(legacy).profileId).toBeUndefined();
    expect(agentDraftConfigSchema.safeParse(legacy).success).toBe(false);
  });

  it('rejects unknown fields and incomplete memory settings', () => {
    expect(agentDraftConfigSchema.safeParse({ ...draftConfig, temperature: 0.2 }).success).toBe(
      false,
    );
    const missingMemory = agentDraftConfigSchema.safeParse({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      systemPrompt: 'Hello',
      skills: [],
      toolsets: [],
    });
    expect(missingMemory.success).toBe(false);
    if (!missingMemory.success) {
      expect(missingMemory.error.issues.some((issue) => issue.path[0] === 'memory')).toBe(true);
    }
  });

  it('requires at least one field when updating an agent', () => {
    expect(agentUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(agentUpdateRequestSchema.parse({ description: null })).toEqual({ description: null });
  });
});

describe('scoring criteria schema', () => {
  it('accepts every initial criterion type', () => {
    const criteria = [
      {
        id: 'exact',
        type: 'exact_match',
        weight: 1,
        required: true,
        params: { expected: 'Paris', caseSensitive: false },
      },
      {
        id: 'contains',
        type: 'output_contains',
        weight: 0.5,
        required: false,
        params: { text: 'Paris' },
      },
      {
        id: 'excludes',
        type: 'output_not_contains',
        weight: 0,
        required: false,
        params: { text: 'London' },
      },
      {
        id: 'field',
        type: 'json_field_equals',
        weight: 1,
        required: true,
        params: { path: 'city', expected: 'Paris' },
      },
      {
        id: 'schema',
        type: 'json_schema_valid',
        weight: 0.25,
        required: false,
        params: { schema: { type: 'object' } },
      },
      {
        id: 'called',
        type: 'tool_called',
        weight: 1,
        required: true,
        params: { toolName: 'search' },
      },
      {
        id: 'not-called',
        type: 'tool_not_called',
        weight: 1,
        required: true,
        params: { toolName: 'delete_file' },
      },
      {
        id: 'tool-ok',
        type: 'tool_execution_succeeded',
        weight: 1,
        required: false,
        params: { toolName: 'search' },
      },
      {
        id: 'number',
        type: 'numeric_comparison',
        weight: 0.4,
        required: false,
        params: { operator: 'gte', expected: 0.8, path: 'score', tolerance: 0.01 },
      },
    ];

    expect(criteria.map((criterion) => scoringCriterionSchema.parse(criterion))).toEqual(criteria);
  });

  it('rejects an unknown type and invalid type-specific params', () => {
    expect(
      scoringCriterionSchema.safeParse({
        id: 'bad',
        type: 'llm_judge',
        weight: 1,
        required: true,
        params: {},
      }).success,
    ).toBe(false);

    const missingExpected = scoringCriterionSchema.safeParse({
      id: 'exact',
      type: 'exact_match',
      weight: 1,
      required: true,
      params: {},
    });
    expect(missingExpected.success).toBe(false);
    if (!missingExpected.success) {
      expect(
        missingExpected.error.issues.some((issue) => issue.path.join('.') === 'params.expected'),
      ).toBe(true);
    }

    expect(
      scoringCriterionSchema.safeParse({
        id: 'field',
        type: 'json_field_equals',
        weight: 1.2,
        required: true,
        params: { path: 'city', expected: { nested: true } },
      }).success,
    ).toBe(false);

    expect(
      scoringCriterionSchema.safeParse({
        id: 'number',
        type: 'numeric_comparison',
        weight: 1,
        required: true,
        params: { operator: 'approx', expected: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects a task without the fields the evaluator must keep', () => {
    expect(
      taskCreateRequestSchema.safeParse({
        name: 'Incomplete',
        input: 'Hello',
      }).success,
    ).toBe(false);
    expect(
      taskCreateRequestSchema.parse({
        name: 'Defaults',
        input: 'Hello',
        expectedOutcome: null,
        scoringCriteria: [],
      }),
    ).toMatchObject({ tags: [], expectedOutcome: null });
    expect(
      taskCreateRequestSchema.safeParse({
        name: 'Defaults',
        input: 'Hello',
        expectedOutcome: null,
        scoringCriteria: [],
        version: 4,
      }).success,
    ).toBe(false);
    expect(taskUpdateRequestSchema.safeParse({ version: 4 }).success).toBe(false);
  });
});

describe('experiment create schema', () => {
  const agentId = '11111111-1111-4111-8111-111111111111';
  const configurationId = '22222222-2222-4222-8222-222222222222';
  const taskId = '33333333-3333-4333-8333-333333333333';

  it('accepts a create request and rejects duplicate configurations', () => {
    expect(
      experimentCreateRequestSchema.parse({
        name: 'Prompt comparison',
        agentId,
        configurationIds: [configurationId],
        taskIds: [taskId],
      }).name,
    ).toBe('Prompt comparison');

    const duplicate = experimentCreateRequestSchema.safeParse({
      name: 'Prompt comparison',
      agentId,
      configurationIds: [configurationId, configurationId],
      taskIds: [taskId],
    });
    expect(duplicate.success).toBe(false);
  });
});

describe('pagination query schema', () => {
  it('applies defaults and rejects out-of-range values', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '10' })).toEqual({
      page: 2,
      pageSize: 10,
    });
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: 'nope' }).success).toBe(false);
  });
});
