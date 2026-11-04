import { z } from 'zod';

const experimentConfigurationInputSchema = z
  .object({
    agentConfigurationId: z.uuid(),
    label: z.string().trim().min(1).max(200),
    displayOrder: z.number().int().min(0),
  })
  .strict();

const experimentTaskInputSchema = z
  .object({
    taskId: z.uuid(),
    executionOrder: z.number().int().min(0),
  })
  .strict();

export const experimentCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5_000).nullable().optional(),
    hypothesis: z.string().trim().min(1).max(5_000).nullable().optional(),
    repetitions: z.number().int().min(1).max(1_000),
    concurrency: z.number().int().min(1).max(100),
    timeoutSeconds: z.number().int().min(1).max(86_400),
    passThreshold: z.number().min(0).max(1),
    configurations: z.array(experimentConfigurationInputSchema).min(1).max(50),
    tasks: z.array(experimentTaskInputSchema).min(1).max(500),
  })
  .strict()
  .refine(
    (value) => {
      const ids = value.configurations.map((item) => item.agentConfigurationId);
      return new Set(ids).size === ids.length;
    },
    {
      path: ['configurations'],
      message: 'Each agent configuration can be added to an experiment only once.',
    },
  );

export type ExperimentCreateRequest = z.infer<typeof experimentCreateRequestSchema>;
