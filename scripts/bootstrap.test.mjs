import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import {
  assertSupportedNode,
  assertSupportedNpm,
  configHasModel,
  copyProfile,
  enabledToolsetIds,
  hermesInstallArgs,
  memoryIsDisabled,
  skillsListIsEmpty,
  modelMatches,
  parseHermesVersion,
  parseModelJson,
  PINNED_HERMES_COMMIT,
  readDotenv,
  redact,
  requireOpenAiKey,
  SUPPORTED_HERMES_VERSION,
} from './bootstrap.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { seedDatabase } = await import('../apps/api/prisma/seed.mjs');

describe('local setup checks', () => {
  it('accepts Node 24.15 and npm 11', () => {
    assert.doesNotThrow(() => assertSupportedNode('24.15.0'));
    assert.doesNotThrow(() => assertSupportedNode('24.22.2'));
    assert.throws(() => assertSupportedNode('24.14.1'), /24\.15/);
    assert.doesNotThrow(() => assertSupportedNpm('11.11.0'));
    assert.throws(() => assertSupportedNpm('10.9.0'), /npm 11/);
  });

  it('reads the pinned Hermes version and rejects other text', () => {
    assert.equal(
      parseHermesVersion('Hermes Agent v0.22.7 (2026.9.24) · stable · local b200f5bc60e3'),
      SUPPORTED_HERMES_VERSION,
    );
    assert.equal(parseHermesVersion('Hermes Agent v0.23.0'), '0.23.0');
    assert.equal(parseHermesVersion('hermes: not installed'), '');
  });

  it('reports a missing OpenAI key without including a secret', () => {
    assert.throws(
      () => requireOpenAiKey(readDotenv('OPENAI_API_KEY=\nPORT=3000\n')),
      /OPENAI_API_KEY is missing/,
    );
    assert.equal(requireOpenAiKey(readDotenv('OPENAI_API_KEY=test-key-value\n')), 'test-key-value');
  });

  it('redacts API keys from command output', () => {
    const secret = 'sk-testvalue123456';
    assert.equal(redact(`failed ${secret}`, [secret]), 'failed [redacted]');
    assert.equal(
      redact('Authorization Bearer sk-othersecret123', []),
      'Authorization Bearer [redacted]',
    );
  });

  it('recognizes the eval-base model response', () => {
    const output =
      '{"provider": "openai-api", "default": "gpt-5.4-mini", "base_url": "https://api.openai.com/v1"}';
    assert.equal(modelMatches(parseModelJson(output)), true);
    assert.equal(modelMatches(parseModelJson('""')), false);
    assert.equal(
      configHasModel(
        'model:\n  provider: openai-api\n  default: gpt-5.4-mini\n  base_url: https://api.openai.com/v1\n',
      ),
      true,
    );
  });

  it('reads enabled toolsets and an empty skill list', () => {
    const tools = [
      'Built-in toolsets (cli):',
      '  ✓ enabled  web  Web',
      '  ✗ disabled  memory  Memory',
      '  ✓ enabled  terminal  Terminal',
    ].join('\n');
    assert.deepEqual(enabledToolsetIds(tools), ['web', 'terminal']);
    assert.equal(
      skillsListIsEmpty('0 hub-installed, 0 builtin, 0 local — 0 enabled, 0 disabled'),
      true,
    );
    assert.equal(skillsListIsEmpty('1 builtin — 1 enabled, 0 disabled'), false);
    assert.equal(
      memoryIsDisabled('memory:\n  memory_enabled: false\n  user_profile_enabled: false\n'),
      true,
    );
    assert.equal(memoryIsDisabled('memory:\n  memory_enabled: true\n'), false);
  });

  it('pins the documented non-interactive Hermes installer', () => {
    const args = hermesInstallArgs({
      script: '/tmp/install.sh',
      hermesHome: '/work/.hermes',
      installDir: '/work/.hermes/hermes-agent',
    });
    assert.deepEqual(args.slice(1, 3), ['--non-interactive', '--commit']);
    assert.equal(args.includes(PINNED_HERMES_COMMIT), true);
    assert.equal(args.includes('--hermes-home'), true);
    assert.equal(args.includes('--skip-browser'), true);
    assert.equal(args.includes('--skip-computer-use'), true);
    assert.equal(args.includes('--channel'), false);
  });

  it('copies profile configuration without sessions or memory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'eval-bootstrap-'));
    const source = path.join(root, 'source');
    const dest = path.join(root, 'dest');
    await mkdir(path.join(source, 'skills'), { recursive: true });
    await mkdir(path.join(source, 'sessions'), { recursive: true });
    await writeFile(path.join(source, 'config.yaml'), 'model: gpt-5.4-mini\n');
    await writeFile(path.join(source, '.env'), 'OPENAI_API_KEY=test-key-value\n');
    await writeFile(path.join(source, 'sessions', 'session.txt'), 'session\n');
    await writeFile(path.join(source, 'state.db'), 'db');
    try {
      await copyProfile(source, dest);
      assert.equal(await readFile(path.join(dest, 'config.yaml'), 'utf8'), 'model: gpt-5.4-mini\n');
      assert.equal((await stat(path.join(dest, '.env'))).mode & 0o777, 0o600);
      await assert.rejects(readFile(path.join(dest, 'sessions', 'session.txt')));
      await assert.rejects(readFile(path.join(dest, 'state.db')));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not replace demo rows that already exist', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE Agent (id TEXT PRIMARY KEY, name TEXT)');
    const data = {
      order: ['Agent'],
      tables: { Agent: { columns: ['id', 'name'], rows: [['a', 'Ada']] } },
    };
    assert.equal(seedDatabase(db, data).Agent, 1);
    data.tables.Agent.rows[0][1] = 'Changed';
    assert.equal(seedDatabase(db, data).Agent, 0);
    assert.equal(db.prepare('SELECT name FROM Agent WHERE id = ?').get('a').name, 'Ada');
    db.close();
  });
});
