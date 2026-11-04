import { existsSync } from 'node:fs';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { validateEnv } from './common/config/env.schema';
import { findRepoRoot } from './common/config/repo-root';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AgentsModule } from './modules/agents/agents.module';
import { HealthModule } from './modules/health/health.module';
import { TasksModule } from './modules/tasks/tasks.module';

const envFile = path.join(findRepoRoot(__dirname), '.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: existsSync(envFile) ? envFile : undefined,
      validate: validateEnv,
    }),
    HealthModule,
    AgentsModule,
    TasksModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
