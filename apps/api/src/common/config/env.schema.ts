import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .regex(/^file:/, 'DATABASE_URL must be a SQLite file: URL')
    .default('file:./data/dev.db'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}
