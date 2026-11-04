const { readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const statePath = path.join(tmpdir(), 'eval-harness-platform-test-db.json');

module.exports = function globalTeardown() {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  rmSync(state.dir, { recursive: true, force: true });
  rmSync(statePath, { force: true });
};
