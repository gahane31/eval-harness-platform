import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@eval/shared';
import type { ApiErrorDetail } from '@eval/shared';
import { ZodError } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../exceptions/app.exception';
import { formatZodIssues } from '../utils/zod-errors';

export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  details: ApiErrorDetail[];
}

export function mapException(exception: unknown): ApiErrorBody {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof ZodError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid request.',
      details: formatZodIssues(exception),
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaKnownError(exception);
  }

  if (
    exception instanceof Prisma.PrismaClientInitializationError ||
    exception instanceof Prisma.PrismaClientRustPanicError
  ) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: ErrorCode.DATABASE_UNAVAILABLE,
      message: 'Database is unavailable.',
      details: [],
    };
  }

  if (exception instanceof HttpException) {
    return mapHttpException(exception);
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred.',
    details: [],
  };
}

function mapPrismaKnownError(error: Prisma.PrismaClientKnownRequestError): ApiErrorBody {
  if (error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    return {
      status: HttpStatus.CONFLICT,
      code: ErrorCode.CONFLICT,
      message: 'A record with these values already exists.',
      details: target.map((field) => ({ path: field, message: 'Already exists.' })),
    };
  }

  if (error.code === 'P2003') {
    return {
      status: HttpStatus.CONFLICT,
      code: ErrorCode.CONFLICT,
      message: 'The request references a record that does not exist or is still in use.',
      details: [],
    };
  }

  if (error.code === 'P2025') {
    return {
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      message: 'Record not found.',
      details: [],
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred.',
    details: [],
  };
}

function mapHttpException(exception: HttpException): ApiErrorBody {
  const status = exception.getStatus();
  const rawMessage = readHttpMessage(exception);

  if (status === HttpStatus.BAD_REQUEST && /json/i.test(rawMessage)) {
    return {
      status,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid JSON body.',
      details: [],
    };
  }

  if (status === HttpStatus.NOT_FOUND) {
    return {
      status,
      code: ErrorCode.NOT_FOUND,
      message: 'Resource not found.',
      details: [],
    };
  }

  if (status === HttpStatus.BAD_REQUEST) {
    return {
      status,
      code: ErrorCode.BAD_REQUEST,
      message: 'Invalid request.',
      details: [],
    };
  }

  if (status >= 500) {
    return {
      status,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
      details: [],
    };
  }

  return {
    status,
    code: ErrorCode.BAD_REQUEST,
    message: 'Invalid request.',
    details: [],
  };
}

function readHttpMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }

  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = response.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message.join(' ');
    }
  }

  return exception.message;
}
