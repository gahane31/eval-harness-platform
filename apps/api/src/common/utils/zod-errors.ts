import type { ApiErrorDetail } from '@eval/shared';
import type { ZodError } from 'zod';

export function formatZodIssues(error: ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.map(String).join('.') : '$',
    message: issue.message,
  }));
}
