import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../common/config/env.schema';
import { findApiPackageRoot } from '../common/config/repo-root';
import { ensureSqliteDirectory, resolveDatabaseUrl } from './resolve-database-url';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    const databaseUrl = resolveDatabaseUrl(
      config.get('DATABASE_URL', { infer: true }),
      findApiPackageRoot(__dirname),
    );
    ensureSqliteDirectory(databaseUrl);
    const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
