import { z } from 'zod';
import { experimentStatusSchema } from './experiment';

export const runStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
]);

export const runUsageSchema = z
  .object({
    session_id: z.string().optional(),
    completed: z.boolean().optional(),
    partial: z.boolean().optional(),
    interrupted: z.boolean().optional(),
    turn_exit_reason: z.string().optional(),
    api_calls: z.number().optional(),
    total_tokens: z.number().optional(),
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    reasoning_tokens: z.number().optional(),
    cache_read_tokens: z.number().optional(),
    cache_write_tokens: z.number().optional(),
    estimated_cost_usd: z.number().nullable().optional(),
    cost_status: z.string().optional(),
    cost_source: z.string().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
  })
  .strict();

export const runSummarySchema = z
  .object({
    id: z.uuid(),
    experimentId: z.uuid(),
    experimentConfigurationId: z.uuid(),
    configurationLabel: z.string(),
    configurationVersion: z.number().int().positive(),
    experimentTaskId: z.uuid(),
    taskName: z.string(),
    status: runStatusSchema,
    durationMs: z.number().int().nonnegative().nullable(),
    processExitCode: z.number().int().nullable(),
    hermesSessionId: z.string().nullable(),
  })
  .strict();

export const runDetailSchema = runSummarySchema
  .extend({
    hermesProfile: z.string().nullable(),
    finalOutput: z.string().nullable(),
    error: z.string().nullable(),
    structuredOutput: z
      .object({
        extracted: z.unknown().nullable(),
        parsed: z.boolean(),
        parseError: z.string().nullable(),
        schemaValid: z.boolean().nullable(),
        validationErrors: z.array(z.string()),
      })
      .strict()
      .nullable(),
    usage: runUsageSchema.nullable(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const experimentExecutionSchema = z
  .object({
    experimentId: z.uuid(),
    status: experimentStatusSchema,
    planned: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunUsage = z.infer<typeof runUsageSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type ExperimentExecution = z.infer<typeof experimentExecutionSchema>;
