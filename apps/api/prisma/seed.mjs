import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const COLUMN_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Insert demo rows that are not already present.
 * Existing rows, including evaluation results, are left unchanged.
 * @param {import('better-sqlite3').Database} db
 * @param {{ order: string[], tables: Record<string, { columns: string[], rows: unknown[][] }> }} data
 */
export function seedDatabase(db, data) {
  const inserted = {};
  db.pragma('foreign_keys = ON');
  const write = db.transaction(() => {
    for (const table of data.order) {
      const spec = data.tables[table];
      if (!spec || !Array.isArray(spec.columns) || !Array.isArray(spec.rows)) {
        throw new Error(`Seed data is missing table ${table}.`);
      }
      if (!COLUMN_NAME.test(table) || spec.columns.some((column) => !COLUMN_NAME.test(column))) {
        throw new Error(`Seed data has an unexpected column name for ${table}.`);
      }
      const quotedColumns = spec.columns.map((column) => `"${column}"`).join(', ');
      const placeholders = spec.columns.map(() => '?').join(', ');
      const statement = db.prepare(
        `INSERT OR IGNORE INTO "${table}" (${quotedColumns}) VALUES (${placeholders})`,
      );
      let count = 0;
      for (const row of spec.rows) {
        if (!Array.isArray(row) || row.length !== spec.columns.length) {
          throw new Error(`Seed row for ${table} does not match its columns.`);
        }
        count += statement.run(row).changes;
      }
      inserted[table] = count;
    }
  });
  write();
  return inserted;
}

function resolveSqlitePath(databaseUrl, apiRoot) {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a SQLite file: URL.');
  }
  const rawPath = databaseUrl.slice('file:'.length).replace(/^\/\//, '');
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(apiRoot, rawPath);
}

function seedFile() {
  const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = path.resolve(apiRoot, '../..');
  loadEnv({ path: path.join(repoRoot, '.env') });
  const databaseUrl = process.env.DATABASE_URL ?? 'file:./data/dev.db';
  const databasePath = resolveSqlitePath(databaseUrl, apiRoot);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const data = JSON.parse(readFileSync(path.join(apiRoot, 'prisma', 'seed-data.json'), 'utf8'));
  const db = new Database(databasePath);
  try {
    const inserted = seedDatabase(db, data);
    const total = Object.values(inserted).reduce((sum, count) => sum + count, 0);
    if (total === 0) {
      console.log('Demo data already present.');
    } else {
      console.log(`Inserted ${total} demo rows.`);
    }
  } finally {
    db.close();
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  seedFile();
}
