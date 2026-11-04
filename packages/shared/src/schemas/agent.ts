import { z } from 'zod';

export const agentDraftConfigSchema = z
  .object({
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
  })
  .strict();

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
  draftConfig: agentDraftConfigSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type AgentDraftConfig = z.infer<typeof agentDraftConfigSchema>;
export type AgentCreateRequest = z.infer<typeof agentCreateRequestSchema>;
export type AgentUpdateRequest = z.infer<typeof agentUpdateRequestSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
