import { z } from 'zod';

export const runtimeDiscoveryErrorCodeSchema = z.enum([
  'EXECUTABLE_NOT_FOUND',
  'COMMAND_FAILED',
  'TIMEOUT',
  'OUTPUT_LIMIT',
  'UNSUPPORTED_OUTPUT',
  'UNSUPPORTED_VERSION',
  'PROFILE_NOT_FOUND',
]);

export const runtimeDiscoveryErrorSchema = z
  .object({
    capability: z.string(),
    code: runtimeDiscoveryErrorCodeSchema,
    message: z.string(),
    exitCode: z.number().int().optional(),
  })
  .strict();

export const runtimeSkillSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    source: z.string().optional(),
    installed: z.boolean(),
    enabled: z.boolean(),
    configurable: z.boolean(),
    limitation: z.string().optional(),
  })
  .strict();

export const runtimeToolsetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    available: z.boolean(),
    enabled: z.boolean(),
    configurable: z.boolean(),
    limitation: z.string().optional(),
  })
  .strict();

export const modelAvailabilitySchema = z.enum(['unknown', 'available', 'unavailable']);

export const runtimeModelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    availability: modelAvailabilitySchema,
    reasoningOptions: z.array(z.string()).optional(),
    limitation: z.string().optional(),
  })
  .strict();

export const runtimeModelProviderSchema = z
  .object({
    provider: z.string(),
    models: z.array(runtimeModelSchema),
  })
  .strict();

export const runtimeProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    isDefault: z.boolean(),
    model: z.string().optional(),
    provider: z.string().optional(),
    status: z.string().optional(),
  })
  .strict();

export const runtimeCapabilitiesSchema = z
  .object({
    runtime: z.literal('hermes'),
    version: z.string(),
    available: z.boolean(),
    discoveredAt: z.iso.datetime(),
    cached: z.boolean(),
    profile: z.string(),
    discoveryErrors: z.array(runtimeDiscoveryErrorSchema),
  })
  .strict();

export const runtimeSkillCatalogueSchema = z
  .object({
    profile: z.string(),
    skills: z.array(runtimeSkillSchema),
    discoveryErrors: z.array(runtimeDiscoveryErrorSchema),
    cached: z.boolean(),
    discoveredAt: z.iso.datetime(),
  })
  .strict();

export const runtimeToolsetCatalogueSchema = z
  .object({
    profile: z.string(),
    toolsets: z.array(runtimeToolsetSchema),
    discoveryErrors: z.array(runtimeDiscoveryErrorSchema),
    cached: z.boolean(),
    discoveredAt: z.iso.datetime(),
  })
  .strict();

export const runtimeModelCatalogueSchema = z
  .object({
    profile: z.string(),
    providers: z.array(runtimeModelProviderSchema),
    discoveryErrors: z.array(runtimeDiscoveryErrorSchema),
    cached: z.boolean(),
    discoveredAt: z.iso.datetime(),
  })
  .strict();

export const runtimeProfileCatalogueSchema = z
  .object({
    profiles: z.array(runtimeProfileSchema),
    activeProfile: z.string().optional(),
    discoveryErrors: z.array(runtimeDiscoveryErrorSchema),
    cached: z.boolean(),
    discoveredAt: z.iso.datetime(),
  })
  .strict();

const profileIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'Profile id is not valid.');

export const runtimeRefreshQuerySchema = z
  .object({
    refresh: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const runtimeScopedQuerySchema = runtimeRefreshQuerySchema
  .extend({
    profile: profileIdSchema,
  })
  .strict();

export type RuntimeDiscoveryError = z.infer<typeof runtimeDiscoveryErrorSchema>;
export type RuntimeSkill = z.infer<typeof runtimeSkillSchema>;
export type RuntimeToolset = z.infer<typeof runtimeToolsetSchema>;
export type RuntimeModel = z.infer<typeof runtimeModelSchema>;
export type RuntimeModelProvider = z.infer<typeof runtimeModelProviderSchema>;
export type RuntimeProfile = z.infer<typeof runtimeProfileSchema>;
export type RuntimeCapabilities = z.infer<typeof runtimeCapabilitiesSchema>;
export type RuntimeSkillCatalogue = z.infer<typeof runtimeSkillCatalogueSchema>;
export type RuntimeToolsetCatalogue = z.infer<typeof runtimeToolsetCatalogueSchema>;
export type RuntimeModelCatalogue = z.infer<typeof runtimeModelCatalogueSchema>;
export type RuntimeProfileCatalogue = z.infer<typeof runtimeProfileCatalogueSchema>;
export type RuntimeDiscoveryErrorCode = z.infer<typeof runtimeDiscoveryErrorCodeSchema>;
export type RuntimeRefreshQuery = z.infer<typeof runtimeRefreshQuerySchema>;
export type RuntimeScopedQuery = z.infer<typeof runtimeScopedQuerySchema>;
