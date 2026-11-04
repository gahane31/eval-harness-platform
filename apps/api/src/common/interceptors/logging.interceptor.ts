import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap, type Observable } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          JSON.stringify({
            requestId: request.requestId ?? 'unknown',
            method: request.method,
            path: request.originalUrl,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          }),
        );
      }),
    );
  }
}
