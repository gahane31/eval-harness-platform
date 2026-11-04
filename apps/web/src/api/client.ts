import { apiErrorEnvelopeSchema, type ApiErrorDetail } from '@eval/shared';
import type { ZodType } from 'zod';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = (
  typeof configuredBaseUrl === 'string' && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : 'http://localhost:3000/api/v1'
).replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the API.');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = apiErrorEnvelopeSchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message,
        parsedError.data.error.details,
      );
    }
    throw new ApiError(response.status, 'HTTP_ERROR', 'Request failed.');
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'The API returned an unexpected response.',
    );
  }

  return parsed.data;
}
