import { z } from 'zod';

const profileIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'Profile id is not valid.');

const draftConfigShape = {
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  reasoning: z.string().trim().min(1).max(100).optional(),
  systemPrompt: z.string().max(100_000),
  skills: z.array(z.string().trim().min(1).max(200)).max(100),
  toolsets: z.array(z.string().trim().min(1).max(200)).max(100),
  memory: z
    .object({
      enabled: z.boolean(),
    })
    .strict(),
};

function withUniqueSelections<T extends z.ZodType<{ skills: string[]; toolsets: string[] }>>(
  schema: T,
) {
  return schema
    .refine((value) => new Set(value.skills).size === value.skills.length, {
      path: ['skills'],
      message: 'Duplicate skill identifier.',
    })
    .refine((value) => new Set(value.toolsets).size === value.toolsets.length, {
      path: ['toolsets'],
      message: 'Duplicate toolset identifier.',
    });
}

/**
 * Shape accepted when reading a row written before profileId existed.
 * A missing profileId stays missing. Callers must not fill one in.
 */
export const storedAgentDraftConfigSchema = withUniqueSelections(
  z
    .object({
      profileId: profileIdSchema.optional(),
      ...draftConfigShape,
    })
    .strict(),
);

export const agentDraftConfigSchema = withUniqueSelections(
  z
    .object({
      profileId: profileIdSchema,
      ...draftConfigShape,
    })
    .strict(),
);

export const agentCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5_000).nullable().optional(),
    draftConfig: agentDraftConfigSchema,
  })
  .strict();

export const agentUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(5_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const agentResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  draftConfig: storedAgentDraftConfigSchema,
  publishedVersionCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const configurationIssueCodeSchema = z.enum([
  'UNSUPPORTED_CAPABILITY',
  'UNVERIFIED_BEHAVIOR',
  'DISCOVERY_FAILED',
]);

export const configurationIssueSchema = z
  .object({
    path: z.string(),
    code: configurationIssueCodeSchema,
    message: z.string(),
  })
  .strict();

export const configurationValidationSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(configurationIssueSchema),
    warnings: z.array(configurationIssueSchema),
  })
  .strict();

export const agentConfigurationVersionSchema = z
  .object({
    id: z.uuid(),
    agentId: z.uuid(),
    version: z.number().int().positive(),
    configSnapshot: storedAgentDraftConfigSchema,
    configHash: z.string().regex(/^[a-f0-9]{64}$/),
    warnings: z.array(configurationIssueSchema),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const publishConfigurationResponseSchema = agentConfigurationVersionSchema
  .extend({
    reused: z.boolean(),
  })
  .strict();

export type StoredAgentDraftConfig = z.infer<typeof storedAgentDraftConfigSchema>;
export type AgentDraftConfig = z.infer<typeof agentDraftConfigSchema>;
export type AgentCreateRequest = z.infer<typeof agentCreateRequestSchema>;
export type AgentUpdateRequest = z.infer<typeof agentUpdateRequestSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type ConfigurationIssue = z.infer<typeof configurationIssueSchema>;
export type ConfigurationValidation = z.infer<typeof configurationValidationSchema>;
export type AgentConfigurationVersion = z.infer<typeof agentConfigurationVersionSchema>;
export type PublishConfigurationResponse = z.infer<typeof publishConfigurationResponseSchema>;
