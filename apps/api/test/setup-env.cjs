const { readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const statePath = path.join(tmpdir(), 'eval-harness-platform-test-db.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = state.databaseUrl;
process.env.PORT = '0';
process.env.WEB_ORIGIN = 'http://localhost:5173';
