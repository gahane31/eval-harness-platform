import { z } from 'zod';
import { jsonPrimitiveSchema, jsonValueSchema } from './json';

const criterionIdSchema = z.string().trim().min(1).max(100);
const weightSchema = z.number().min(0).max(1);
const toolNameSchema = z.string().trim().min(1).max(200);

const criterionFields = {
  id: criterionIdSchema,
  weight: weightSchema,
  required: z.boolean(),
};

export const exactMatchCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('exact_match'),
    params: z
      .object({
        expected: z.string().min(1),
        caseSensitive: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const outputContainsCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('output_contains'),
    params: z
      .object({
        text: z.string().min(1),
        caseSensitive: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const outputNotContainsCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('output_not_contains'),
    params: z
      .object({
        text: z.string().min(1),
        caseSensitive: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const jsonFieldEqualsCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('json_field_equals'),
    params: z
      .object({
        path: z.string().trim().min(1).max(500),
        expected: jsonPrimitiveSchema,
      })
      .strict(),
  })
  .strict();

export const jsonSchemaValidCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('json_schema_valid'),
    params: z
      .object({
        schema: z.union([z.record(z.string(), jsonValueSchema), z.boolean()]),
      })
      .strict(),
  })
  .strict();

export const toolCalledCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('tool_called'),
    params: z
      .object({
        toolName: toolNameSchema,
      })
      .strict(),
  })
  .strict();

export const toolNotCalledCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('tool_not_called'),
    params: z
      .object({
        toolName: toolNameSchema,
      })
      .strict(),
  })
  .strict();

export const toolExecutionSucceededCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('tool_execution_succeeded'),
    params: z
      .object({
        toolName: toolNameSchema,
      })
      .strict(),
  })
  .strict();

export const numericComparisonCriterionSchema = z
  .object({
    ...criterionFields,
    type: z.literal('numeric_comparison'),
    params: z
      .object({
        operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
        expected: z.number().finite(),
        path: z.string().trim().min(1).max(500).optional(),
        tolerance: z.number().finite().min(0).optional(),
      })
      .strict(),
  })
  .strict();

export const scoringCriterionSchema = z.discriminatedUnion('type', [
  exactMatchCriterionSchema,
  outputContainsCriterionSchema,
  outputNotContainsCriterionSchema,
  jsonFieldEqualsCriterionSchema,
  jsonSchemaValidCriterionSchema,
  toolCalledCriterionSchema,
  toolNotCalledCriterionSchema,
  toolExecutionSucceededCriterionSchema,
  numericComparisonCriterionSchema,
]);

export const scoringCriteriaSchema = z.array(scoringCriterionSchema).max(100);

export type ScoringCriterion = z.infer<typeof scoringCriterionSchema>;
export type ScoringCriterionType = ScoringCriterion['type'];
