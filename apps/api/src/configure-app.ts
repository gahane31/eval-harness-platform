import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './common/config/env.schema';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<Env, true>);
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    exposedHeaders: ['x-request-id'],
  });
  app.use(requestIdMiddleware);
  app.enableShutdownHooks();
}
