import { z } from 'zod';
import { jsonValueSchema } from './json';

export const criterionResultSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    applicable: z.boolean(),
    passed: z.boolean().nullable(),
    weight: z.number(),
    required: z.boolean(),
    expected: jsonValueSchema.nullable(),
    actual: jsonValueSchema.nullable(),
    explanation: z.string(),
  })
  .strict();

export const runEvaluationSchema = z
  .object({
    id: z.uuid(),
    runId: z.uuid(),
    score: z.number().min(0).max(1),
    passed: z.boolean(),
    criterionResults: z.array(criterionResultSchema),
    evaluatedAt: z.iso.datetime(),
  })
  .strict();

export const evaluateRequestSchema = z
  .object({
    reevaluate: z.boolean().optional(),
  })
  .strict();

export const experimentEvaluationSummarySchema = z
  .object({
    experimentId: z.uuid(),
    passThreshold: z.number().min(0).max(1),
    planned: z.number().int().nonnegative(),
    completedRuns: z.number().int().nonnegative(),
    failedRuns: z.number().int().nonnegative(),
    evaluatedRuns: z.number().int().nonnegative(),
    passedEvaluations: z.number().int().nonnegative(),
    failedEvaluations: z.number().int().nonnegative(),
    notEvaluated: z.number().int().nonnegative(),
    notEvaluable: z.number().int().nonnegative(),
    averageScore: z.number().min(0).max(1).nullable(),
    passRate: z.number().min(0).max(1).nullable(),
  })
  .strict();

const comparisonConfigurationSchema = z
  .object({
    experimentConfigurationId: z.uuid(),
    label: z.string(),
    version: z.number().int().positive(),
    completedRuns: z.number().int().nonnegative(),
    evaluatedRuns: z.number().int().nonnegative(),
    averageScore: z.number().min(0).max(1).nullable(),
    passRate: z.number().min(0).max(1).nullable(),
    passedEvaluations: z.number().int().nonnegative(),
    failedEvaluations: z.number().int().nonnegative(),
  })
  .strict();

const comparisonScoreSchema = z
  .object({
    experimentConfigurationId: z.uuid(),
    score: z.number().min(0).max(1).nullable(),
  })
  .strict();

const comparisonTaskSchema = z
  .object({
    experimentTaskId: z.uuid(),
    taskName: z.string(),
    scores: z.array(comparisonScoreSchema),
  })
  .strict();

export const configurationComparisonSchema = z
  .object({
    experimentId: z.uuid(),
    configurations: z.array(comparisonConfigurationSchema),
    tasks: z.array(comparisonTaskSchema),
  })
  .strict();

export type CriterionResult = z.infer<typeof criterionResultSchema>;
export type RunEvaluation = z.infer<typeof runEvaluationSchema>;
export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;
export type ExperimentEvaluationSummary = z.infer<typeof experimentEvaluationSummarySchema>;
export type ConfigurationComparison = z.infer<typeof configurationComparisonSchema>;
