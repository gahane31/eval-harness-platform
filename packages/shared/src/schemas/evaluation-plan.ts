import { z } from 'zod';
import { experimentStatusSchema } from './experiment';

export const versionPolicySchema = z.enum(['LATEST_PUBLISHED', 'PINNED']);
export const batchStatusSchema = z.enum(['RUNNING', 'COMPLETED', 'FAILED']);
export const batchItemStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);

const descriptionSchema = z.string().trim().min(1).max(5_000).nullable().optional();
const thresholdSchema = z.number().min(0).max(1).nullable().optional();

const evaluationPlanEntryInputSchema = z
  .object({
    agentId: z.uuid(),
    versionPolicy: versionPolicySchema,
    pinnedVersionId: z.uuid().nullable().optional(),
    taskSuiteId: z.uuid(),
    enabled: z.boolean().default(true),
    passRateThreshold: thresholdSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.versionPolicy === 'PINNED' && !entry.pinnedVersionId) {
      context.addIssue({
        code: 'custom',
        path: ['pinnedVersionId'],
        message: 'Choose a published version to pin.',
      });
    }
    if (entry.versionPolicy === 'LATEST_PUBLISHED' && entry.pinnedVersionId) {
      context.addIssue({
        code: 'custom',
        path: ['pinnedVersionId'],
        message: 'Latest published does not use a pinned version.',
      });
    }
  });

export const evaluationPlanWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: descriptionSchema,
    enabled: z.boolean().default(true),
    entries: z.array(evaluationPlanEntryInputSchema).max(50),
  })
  .strict()
  .superRefine((plan, context) => {
    const keys = plan.entries.map((entry) => `${entry.agentId}:${entry.taskSuiteId}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'Each agent and task suite can appear only once in a plan.',
      });
    }
  });

export const costSummarySchema = z
  .object({
    total: z.number().nullable(),
    costedRuns: z.number().int().nonnegative(),
    runs: z.number().int().nonnegative(),
    estimated: z.boolean(),
  })
  .strict();

export const evaluationPlanEntrySchema = z
  .object({
    id: z.uuid(),
    agentId: z.uuid(),
    agentName: z.string(),
    versionPolicy: versionPolicySchema,
    pinnedVersionId: z.uuid().nullable(),
    pinnedVersion: z.number().int().positive().nullable(),
    taskSuiteId: z.uuid(),
    taskSuiteName: z.string(),
    taskCount: z.number().int().nonnegative(),
    enabled: z.boolean(),
    passRateThreshold: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const evaluationPlanSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    enabled: z.boolean(),
    entries: z.array(evaluationPlanEntrySchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const batchItemSchema = z
  .object({
    id: z.uuid(),
    experimentId: z.uuid(),
    agentId: z.uuid(),
    agentName: z.string(),
    versionId: z.uuid(),
    version: z.number().int().positive(),
    taskSuiteId: z.uuid(),
    taskSuiteName: z.string(),
    status: batchItemStatusSchema,
    passRate: z.number().min(0).max(1).nullable(),
    passedTestCases: z.number().int().nonnegative(),
    completedTestCases: z.number().int().nonnegative(),
    failedRuns: z.number().int().nonnegative(),
    passRateThreshold: z.number().min(0).max(1).nullable(),
    thresholdMet: z.boolean().nullable(),
    cost: costSummarySchema,
  })
  .strict();

export const batchCountsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();

export const evaluationBatchSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    status: batchStatusSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    counts: batchCountsSchema,
    passRate: z.number().min(0).max(1).nullable(),
    passedTestCases: z.number().int().nonnegative(),
    completedTestCases: z.number().int().nonnegative(),
    cost: costSummarySchema,
    items: z.array(batchItemSchema),
  })
  .strict();

export const attentionItemSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['running', 'failed', 'threshold']),
    title: z.string(),
    detail: z.string(),
    experimentId: z.uuid(),
  })
  .strict();

export const recentEvaluationSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    agentName: z.string(),
    versions: z.string(),
    status: experimentStatusSchema,
    passRate: z.number().min(0).max(1).nullable(),
    passedTestCases: z.number().int().nonnegative(),
    completedTestCases: z.number().int().nonnegative(),
    failedRuns: z.number().int().nonnegative(),
    cost: costSummarySchema,
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const dashboardSchema = z
  .object({
    agents: z.number().int().nonnegative(),
    tasks: z.number().int().nonnegative(),
    taskSuites: z.number().int().nonnegative(),
    evaluationsToday: z.number().int().nonnegative(),
    agentsEvaluatedToday: z.number().int().nonnegative(),
    passRateToday: z.number().min(0).max(1).nullable(),
    passedTestCasesToday: z.number().int().nonnegative(),
    completedTestCasesToday: z.number().int().nonnegative(),
    costToday: costSummarySchema.nullable(),
    attention: z.array(attentionItemSchema),
    recent: z.array(recentEvaluationSchema),
    plans: z.array(evaluationPlanSchema),
    latestBatch: evaluationBatchSchema.nullable(),
  })
  .strict();

export type EvaluationPlanWrite = z.infer<typeof evaluationPlanWriteSchema>;
export type EvaluationPlan = z.infer<typeof evaluationPlanSchema>;
export type EvaluationBatch = z.infer<typeof evaluationBatchSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type CostSummary = z.infer<typeof costSummarySchema>;
