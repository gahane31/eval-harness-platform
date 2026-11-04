import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Env } from './common/config/env.schema';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Failed to start the API.';
  Logger.error(message, 'Bootstrap');
  process.exit(1);
});
