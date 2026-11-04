import { z } from 'zod';
import { jsonValueSchema } from './json';
import { scoringCriteriaSchema } from './scoring';

const taskNameSchema = z.string().trim().min(1).max(200);
const taskDescriptionSchema = z.string().trim().min(1).max(5_000).nullable();
const taskInputSchema = z.string().min(1).max(100_000);
const taskVersionSchema = z.number().int().min(1).max(1_000_000);
const taskTagsSchema = z.array(z.string().trim().min(1).max(50)).max(50);

export const taskCreateRequestSchema = z
  .object({
    name: taskNameSchema,
    description: taskDescriptionSchema.optional(),
    input: taskInputSchema,
    expectedOutcome: jsonValueSchema,
    scoringCriteria: scoringCriteriaSchema,
    version: taskVersionSchema.default(1),
    tags: taskTagsSchema.default([]),
  })
  .strict();

export const taskUpdateRequestSchema = z
  .object({
    name: taskNameSchema.optional(),
    description: taskDescriptionSchema.optional(),
    input: taskInputSchema.optional(),
    expectedOutcome: jsonValueSchema.optional(),
    scoringCriteria: scoringCriteriaSchema.optional(),
    version: taskVersionSchema.optional(),
    tags: taskTagsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const taskResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  input: z.string(),
  expectedOutcome: jsonValueSchema,
  scoringCriteria: scoringCriteriaSchema,
  version: z.number().int(),
  tags: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type TaskCreateRequest = z.infer<typeof taskCreateRequestSchema>;
export type TaskUpdateRequest = z.infer<typeof taskUpdateRequestSchema>;
export type TaskResponse = z.infer<typeof taskResponseSchema>;
