import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { mapException } from './map-exception';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';
    const mapped = mapException(exception);

    const logPayload = {
      requestId,
      method: request.method,
      path: request.originalUrl,
      statusCode: mapped.status,
      code: mapped.code,
    };

    if (mapped.status >= 500) {
      this.logger.error(JSON.stringify(logPayload));
      if (exception instanceof Error && exception.stack) {
        this.logger.error(exception.stack);
      }
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    response.status(mapped.status).json({
      success: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details,
      },
      meta: { requestId },
    });
  }
}
