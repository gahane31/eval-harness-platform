import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@eval/shared';
import type { ZodType } from 'zod';
import { AppException } from '../exceptions/app.exception';
import { formatZodIssues } from '../utils/zod-errors';

@Injectable()
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<unknown, T['_output']> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): T['_output'] {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Invalid request.',
        formatZodIssues(result.error),
      );
    }

    return result.data;
  }
}
