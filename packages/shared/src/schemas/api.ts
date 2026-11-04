import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/pagination';

export const apiErrorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const apiErrorEnvelopeSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.array(apiErrorDetailSchema),
      })
      .strict(),
    meta: z
      .object({
        requestId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const listMetaSchema = paginationMetaSchema.extend({
  requestId: z.string().min(1),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export function apiSuccessEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({
      requestId: z.string().min(1),
    }),
  });
}

export function apiListEnvelopeSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    meta: listMetaSchema,
  });
}

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
