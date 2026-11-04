import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@eval/shared';
import { ZodError, z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../exceptions/app.exception';
import { mapException } from './map-exception';

describe('mapException', () => {
  it('formats application and validation errors without a stack trace', () => {
    const validation = mapException(
      new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, 'Invalid request.', [
        { path: 'name', message: 'Too small' },
      ]),
    );
    expect(validation).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request.',
      details: [{ path: 'name', message: 'Too small' }],
    });

    const zodError = new ZodError(z.object({ name: z.string() }).safeParse({}).error?.issues ?? []);
    const mappedZod = mapException(zodError);
    expect(mappedZod.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(mappedZod)).not.toContain('stack');
  });

  it('hides unexpected error messages and stack traces from the client payload', () => {
    const mapped = mapException(new Error('SQLITE_CANTOPEN: file:/secret/dev.db'));
    expect(mapped).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: [],
    });
    expect(JSON.stringify(mapped)).not.toContain('secret');
    expect(JSON.stringify(mapped)).not.toContain('stack');
  });

  it('maps unique constraint failures and unknown routes', () => {
    const conflict = mapException(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: { target: ['agentId', 'version'] },
      }),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe('CONFLICT');
    expect(conflict.details).toEqual([
      { path: 'agentId', message: 'Already exists.' },
      { path: 'version', message: 'Already exists.' },
    ]);

    expect(mapException(new NotFoundException('Cannot GET /missing')).message).toBe(
      'Resource not found.',
    );
    expect(mapException(new BadRequestException('Unexpected token in JSON')).message).toBe(
      'Invalid JSON body.',
    );
  });
});
