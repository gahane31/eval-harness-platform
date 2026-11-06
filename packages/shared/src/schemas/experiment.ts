import { z } from 'zod';
import { jsonValueSchema } from './json';
import { scoringCriteriaSchema } from './scoring';
import { taskResponseSchema } from './task';

const descriptionSchema = z.string().trim().min(1).max(5_000).nullable().optional();
const configurationIdsSchema = z.array(z.uuid()).min(1).max(50);
const taskSuiteIdsSchema = z.array(z.uuid()).max(50).default([]);
const taskIdsSchema = z.array(z.uuid()).max(500).default([]);

function uniqueIds(path: string, message: string) {
  return (value: { [key: string]: string[] }, context: z.RefinementCtx) => {
    const ids = value[path] ?? [];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: [path], message });
    }
  };
}

const selectionShape = {
  configurationIds: configurationIdsSchema,
  taskSuiteIds: taskSuiteIdsSchema,
  taskIds: taskIdsSchema,
};

function withSelectionRules<
  T extends z.ZodType<{ configurationIds: string[]; taskSuiteIds: string[]; taskIds: string[] }>,
>(schema: T) {
  return schema
    .superRefine(
      uniqueIds('configurationIds', 'Each published configuration can be selected only once.'),
    )
    .superRefine(uniqueIds('taskSuiteIds', 'Each task suite can be selected only once.'))
    .superRefine(uniqueIds('taskIds', 'Each task can be selected only once.'))
    .refine((value) => value.taskSuiteIds.length > 0 || value.taskIds.length > 0, {
      path: ['taskIds'],
      message: 'Select a task suite or an individual task.',
    });
}

export const experimentCreateRequestSchema = withSelectionRules(
  z
    .object({
      name: z.string().trim().min(1).max(200),
      description: descriptionSchema,
      agentId: z.uuid(),
      ...selectionShape,
    })
    .strict(),
);

export const experimentUpdateRequestSchema = withSelectionRules(
  z
    .object({
      name: z.string().trim().min(1).max(200),
      description: descriptionSchema,
      ...selectionShape,
    })
    .strict(),
);

export const experimentTaskSnapshotSchema = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    input: z.string(),
    expectedOutcome: jsonValueSchema,
    scoringCriteria: scoringCriteriaSchema,
    outputSchema: jsonValueSchema.nullable().optional(),
    version: z.number().int(),
    tags: z.array(z.string()),
  })
  .strict();

export const experimentStatusSchema = z.enum([
  'DRAFT',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

const experimentConfigurationResponseSchema = z
  .object({
    id: z.uuid(),
    agentConfigurationId: z.uuid(),
    label: z.string(),
    displayOrder: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    configHash: z.string(),
  })
  .strict();

const experimentSuiteResponseSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
  })
  .strict();

const experimentTaskResponseSchema = z
  .object({
    id: z.uuid(),
    taskId: z.uuid(),
    executionOrder: z.number().int().nonnegative(),
    taskSnapshot: experimentTaskSnapshotSchema,
  })
  .strict();

export const experimentResponseSchema = z
  .object({
    id: z.uuid(),
    agentId: z.uuid(),
    agentName: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: experimentStatusSchema,
    configurations: z.array(experimentConfigurationResponseSchema),
    taskSuites: z.array(experimentSuiteResponseSchema),
    tasks: z.array(experimentTaskResponseSchema),
    configurationCount: z.number().int().nonnegative(),
    uniqueTaskCount: z.number().int().nonnegative(),
    plannedExecutionCount: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const taskSuiteCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: descriptionSchema,
  })
  .strict();

export const taskSuiteUpdateRequestSchema = taskSuiteCreateRequestSchema;

export const taskSuiteTasksRequestSchema = z
  .object({
    taskIds: z.array(z.uuid()).max(500),
  })
  .strict()
  .refine((value) => new Set(value.taskIds).size === value.taskIds.length, {
    path: ['taskIds'],
    message: 'Each task can be assigned only once.',
  });

export const taskSuiteResponseSchema = z
  .object({
    id: z.uuid(),
    agentId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    taskCount: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const taskSuiteDetailResponseSchema = taskSuiteResponseSchema
  .extend({
    tasks: z.array(taskResponseSchema),
  })
  .strict();

export type ExperimentCreateRequest = z.infer<typeof experimentCreateRequestSchema>;
export type ExperimentUpdateRequest = z.infer<typeof experimentUpdateRequestSchema>;
export type ExperimentResponse = z.infer<typeof experimentResponseSchema>;
export type ExperimentTaskSnapshot = z.infer<typeof experimentTaskSnapshotSchema>;
export type TaskSuiteCreateRequest = z.infer<typeof taskSuiteCreateRequestSchema>;
export type TaskSuiteUpdateRequest = z.infer<typeof taskSuiteUpdateRequestSchema>;
export type TaskSuiteTasksRequest = z.infer<typeof taskSuiteTasksRequestSchema>;
export type TaskSuiteResponse = z.infer<typeof taskSuiteResponseSchema>;
export type TaskSuiteDetailResponse = z.infer<typeof taskSuiteDetailResponseSchema>;
