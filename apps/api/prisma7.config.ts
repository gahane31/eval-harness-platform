import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { findRepoRoot } from './src/common/config/repo-root';
import { ensureSqliteDirectory, resolveDatabaseUrl } from './src/database/resolve-database-url';

const apiPackageRoot = __dirname;
loadEnv({ path: path.join(findRepoRoot(apiPackageRoot), '.env') });

const databaseUrl = resolveDatabaseUrl(
  process.env.DATABASE_URL ?? 'file:./data/dev.db',
  apiPackageRoot,
);
ensureSqliteDirectory(databaseUrl);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
