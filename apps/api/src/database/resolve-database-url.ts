import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function resolveDatabaseUrl(databaseUrl: string, apiPackageRoot: string): string {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a SQLite file: URL.');
  }

  const rawPath = databaseUrl.slice('file:'.length).replace(/^\/\//, '');
  const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(apiPackageRoot, rawPath);
  return `file:${filePath}`;
}

export function sqliteFilePath(resolvedDatabaseUrl: string): string {
  return resolvedDatabaseUrl.slice('file:'.length);
}

export function ensureSqliteDirectory(resolvedDatabaseUrl: string): void {
  mkdirSync(path.dirname(sqliteFilePath(resolvedDatabaseUrl)), { recursive: true });
}
