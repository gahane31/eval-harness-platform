import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { Paginated } from '../utils/pagination';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = request.requestId ?? 'unknown';

    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof Paginated) {
          return {
            success: true,
            data: data.items,
            meta: {
              requestId,
              ...data.meta,
            },
          };
        }

        return {
          success: true,
          data,
          meta: { requestId },
        };
      }),
    );
  }
}
