const { execSync } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const statePath = path.join(tmpdir(), 'eval-harness-platform-test-db.json');

module.exports = function globalSetup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'eval-harness-'));
  const databaseUrl = `file:${path.join(dir, 'test.db')}`;
  if (databaseUrl.includes(`${path.sep}data${path.sep}dev.db`)) {
    throw new Error('Refusing to run tests against the development database.');
  }

  writeFileSync(statePath, JSON.stringify({ dir, databaseUrl }));
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
};
