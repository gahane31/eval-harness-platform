import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorDetail } from '@eval/shared';

export class AppException extends HttpException {
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: HttpStatus, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message, status);
    this.code = code;
    this.details = details;
  }
}
