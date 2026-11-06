import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const SUPPORTED_HERMES_VERSION = '0.22.7';
export const PINNED_HERMES_COMMIT = 'b200f5bc60e31588ba2cb60e288029c4a54ba5fa';
export const EVAL_PROFILE = 'eval-base';
export const EVAL_PROVIDER = 'openai-api';
export const EVAL_MODEL = 'gpt-5.4-mini';
export const EVAL_BASE_URL = 'https://api.openai.com/v1';
export const PROFILE_COPY_FILES = ['config.yaml', '.env', 'SOUL.md', '.no-bundled-skills'];
const INSTALLER_URL = 'https://hermes-agent.nousresearch.com/install.sh';
const KEY_MARKER = '.openai-key-sha256';
const SKILLS_OPT_OUT = '.no-bundled-skills';

export function projectHermesHome(repoRoot) {
  return path.join(repoRoot, '.hermes');
}

// Prisma accepts Node 20.19, 22.12, and 24 or newer. Vite accepts 20.19 and 22.12 or newer.
// better-sqlite3 accepts majors 20, 22, 23, 24, 25, and 26. Setup allows the overlap.
export function assertSupportedNode(version) {
  const [major, minor] = version.split('.').map((part) => Number(part));
  const supported =
    Number.isInteger(major) &&
    Number.isInteger(minor) &&
    ((major === 20 && minor >= 19) ||
      (major === 22 && minor >= 12) ||
      (major >= 24 && major <= 26));
  if (!supported) {
    throw new Error(
      `Node.js 20.19, Node.js 22.12 or newer within the 22 release, or Node.js 24, 25, or 26 is required. This repository's .nvmrc selects 24.22.2. Current version is ${version}.`,
    );
  }
}

export function assertSupportedNpm(version) {
  const major = Number(version.split('.')[0]);
  if (!Number.isInteger(major) || major < 10) {
    throw new Error(
      `npm 10 or newer is required. Node.js 20.19 and Node.js 22 include npm 10. Current version is ${version}.`,
    );
  }
}

export function parseHermesVersion(output) {
  const match = /Hermes Agent v(\d+\.\d+\.\d+)\b/.exec(output);
  return match?.[1] ?? '';
}

export function stripAnsi(text) {
  const escape = String.fromCharCode(27);
  return text.replace(new RegExp(`${escape}\\[[0-9;]*[A-Za-z]`, 'g'), '');
}

export function enabledToolsetIds(output) {
  const ids = [];
  for (const line of stripAnsi(output).split('\n')) {
    const match = /^\s*[✓✗]?\s*enabled\s{2,}([A-Za-z0-9_-]+)\b/.exec(line);
    if (match?.[1]) {
      ids.push(match[1]);
    }
  }
  return ids;
}

export function skillsListIsEmpty(output) {
  return /0 enabled, 0 disabled/.test(stripAnsi(output));
}

export function memoryIsDisabled(configText) {
  return (
    /memory_enabled:\s*false/.test(configText) && /user_profile_enabled:\s*false/.test(configText)
  );
}

const secretValues = [];

export function addRedactedSecret(secret) {
  if (typeof secret === 'string' && secret.length >= 8 && !secretValues.includes(secret)) {
    secretValues.push(secret);
  }
}

export function redact(text, secrets = []) {
  let result = String(text);
  for (const secret of [...secretValues, ...secrets]) {
    if (typeof secret === 'string' && secret.length >= 8) {
      result = result.split(secret).join('[redacted]');
    }
  }
  return result
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

export function readDotenv(content) {
  const values = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = trimmed
      .slice(0, separator)
      .trim()
      .replace(/^export\s+/, '');
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function requireOpenAiKey(values) {
  const key = values.OPENAI_API_KEY?.trim() ?? '';
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is missing. Copy .env.example to .env in the repository root, set OPENAI_API_KEY, and run npm run dev again.',
    );
  }
  return key;
}

export function parseModelJson(output) {
  const line = output
    .split('\n')
    .map((item) => item.trim())
    .reverse()
    .find((item) => item.startsWith('{'));
  if (!line) {
    return null;
  }
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function modelMatches(model) {
  return (
    model?.provider === EVAL_PROVIDER &&
    model?.default === EVAL_MODEL &&
    model?.base_url === EVAL_BASE_URL
  );
}

export function configHasModel(text) {
  return (
    text.includes(`provider: ${EVAL_PROVIDER}`) &&
    text.includes(`default: ${EVAL_MODEL}`) &&
    text.includes(`base_url: ${EVAL_BASE_URL}`)
  );
}

export function hermesInstallArgs({ script, hermesHome, installDir }) {
  return [
    script,
    '--non-interactive',
    '--commit',
    PINNED_HERMES_COMMIT,
    '--hermes-home',
    hermesHome,
    '--dir',
    installDir,
    '--skip-browser',
    '--skip-computer-use',
  ];
}

export function projectHermesBinary(hermesHome) {
  return path.join(hermesHome, 'hermes-agent', '.hermes', 'bin', 'hermes');
}

export async function copyProfile(sourceDir, destDir) {
  await mkdir(destDir, { recursive: true });
  for (const name of PROFILE_COPY_FILES) {
    try {
      await copyFile(path.join(sourceDir, name), path.join(destDir, name));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  try {
    await cp(path.join(sourceDir, 'skills'), path.join(destDir, 'skills'), { recursive: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  const envFile = path.join(destDir, '.env');
  if (existsSync(envFile)) {
    await chmod(envFile, 0o600);
  }
}

function keyHash(apiKey) {
  return createHash('sha256').update(apiKey).digest('hex');
}

function which(command) {
  return new Promise((resolve) => {
    execFile('/usr/bin/which', [command], { timeout: 5_000 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const found = stdout.trim();
      resolve(found.startsWith('/') ? found : null);
    });
  });
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function ensureDependencies(repoRoot, run, log) {
  const required = [
    path.join(repoRoot, 'node_modules', 'concurrently', 'package.json'),
    path.join(repoRoot, 'node_modules', 'prisma', 'package.json'),
    path.join(repoRoot, 'node_modules', 'vue', 'package.json'),
  ];
  if (required.every((file) => existsSync(file))) {
    return;
  }
  log('Installing npm dependencies.');
  await run('npm', ['install'], { cwd: repoRoot, inherit: true });
}

async function readHermesVersion(executable, projectHome, run) {
  const insideProject =
    executable === projectHermesBinary(projectHome) ||
    executable.startsWith(`${projectHome}${path.sep}`);
  const result = await run(executable, ['--version'], {
    hermesHome: insideProject ? projectHome : undefined,
    stripHermesHome: !insideProject,
    streamStderr: true,
  });
  return parseHermesVersion(`${result.stdout}\n${result.stderr}`);
}

async function installHermes(repoRoot, run, log) {
  const git = await which('git');
  const curl = await which('curl');
  if (!git || !curl) {
    throw new Error('Installing Hermes requires git and curl.');
  }
  const hermesHome = projectHermesHome(repoRoot);
  const installDir = path.join(hermesHome, 'hermes-agent');
  await mkdir(hermesHome, { recursive: true });
  log(
    `Installing Hermes ${SUPPORTED_HERMES_VERSION}. This does not change an existing ~/.hermes profile.`,
  );
  const response = await fetch(INSTALLER_URL);
  if (!response.ok) {
    throw new Error('Could not download the Hermes installer.');
  }
  const scriptText = await response.text();
  if (!scriptText.startsWith('#!/usr/bin/env bash') || !scriptText.includes('--non-interactive')) {
    throw new Error('The downloaded Hermes installer was not the documented install.sh script.');
  }
  const script = path.join(repoRoot, '.hermes', `.install-${randomBytes(4).toString('hex')}.sh`);
  await writeFile(script, scriptText, { mode: 0o700 });
  const launcher = path.join(process.env.HOME ?? '', '.local', 'bin', 'hermes');
  const previousLauncher = existsSync(launcher) ? await readFile(launcher) : null;
  try {
    await run('bash', hermesInstallArgs({ script, hermesHome, installDir }), {
      cwd: repoRoot,
      hermesHome,
      inherit: true,
    });
  } finally {
    if (previousLauncher) {
      await writeFile(launcher, previousLauncher, { mode: 0o755 });
    }
    await rm(script, { force: true });
  }
  const binary = projectHermesBinary(hermesHome);
  const version = await readHermesVersion(binary, hermesHome, run);
  if (version !== SUPPORTED_HERMES_VERSION) {
    throw new Error(
      `The Hermes installer finished, but the project binary is ${version || 'an unknown version'} instead of ${SUPPORTED_HERMES_VERSION}.`,
    );
  }
  return binary;
}

async function resolveHermes(repoRoot, run, log) {
  const hermesHome = projectHermesHome(repoRoot);
  const candidates = [];
  const configured = process.env.HERMES_EXECUTABLE?.trim();
  if (configured) {
    candidates.push(configured);
  }
  const projectBinary = projectHermesBinary(hermesHome);
  if (existsSync(projectBinary)) {
    candidates.push(projectBinary);
  }
  const pathBinary = await which('hermes');
  if (pathBinary) {
    candidates.push(pathBinary);
  }
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate) || !existsSync(candidate)) {
      continue;
    }
    seen.add(candidate);
    try {
      const version = await readHermesVersion(candidate, hermesHome, run);
      if (version === SUPPORTED_HERMES_VERSION) {
        log(`Hermes ${SUPPORTED_HERMES_VERSION} is already installed.`);
        return candidate;
      }
      if (version) {
        log(
          `Found Hermes ${version}. Leaving it in place and installing ${SUPPORTED_HERMES_VERSION} for this project.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hermes version check failed.';
      log(redact(message));
    }
  }
  return installHermes(repoRoot, run, log);
}

async function ensureProfile(executable, hermesHome, apiKey, run, log) {
  const profileDir = path.join(hermesHome, 'profiles', EVAL_PROFILE);
  const configPath = path.join(profileDir, 'config.yaml');
  if (!existsSync(path.join(profileDir, '.env')) && !existsSync(configPath)) {
    log('Creating the eval-base Hermes profile.');
    await run(executable, ['profile', 'create', EVAL_PROFILE, '--no-skills', '--no-alias'], {
      hermesHome,
      streamStderr: true,
    });
  }
  if (!configHasModel(await readText(configPath))) {
    log('Configuring the eval-base model.');
    await run(executable, ['-p', EVAL_PROFILE, 'config', 'set', 'model.provider', EVAL_PROVIDER], {
      hermesHome,
    });
    await run(executable, ['-p', EVAL_PROFILE, 'config', 'set', 'model.default', EVAL_MODEL], {
      hermesHome,
    });
    await run(executable, ['-p', EVAL_PROFILE, 'config', 'set', 'model.base_url', EVAL_BASE_URL], {
      hermesHome,
    });
  }
  const modelText = await readText(configPath);
  if (!configHasModel(modelText)) {
    throw new Error(
      'The eval-base profile does not have the required provider, model, and base URL.',
    );
  }
  const envValues = readDotenv(await readText(path.join(profileDir, '.env')));
  if (envValues.OPENAI_API_KEY !== apiKey) {
    log('Storing the OpenAI API key in the project Hermes profile.');
    await run(executable, ['-p', EVAL_PROFILE, 'config', 'set', 'OPENAI_API_KEY', apiKey], {
      hermesHome,
    });
    const saved = readDotenv(await readText(path.join(profileDir, '.env')));
    if (saved.OPENAI_API_KEY !== apiKey) {
      throw new Error('Hermes did not store the OpenAI API key in the eval-base profile.');
    }
  }
  const envFile = path.join(profileDir, '.env');
  if (existsSync(envFile)) {
    await chmod(envFile, 0o600);
  }
  await restrictProfile(executable, hermesHome, profileDir, configPath, run, log);
}

const LIST_ENV = { COLUMNS: '500', LINES: '200', TERM: 'xterm-256color' };

async function restrictProfile(executable, hermesHome, profileDir, configPath, run, log) {
  const tools = await run(executable, ['-p', EVAL_PROFILE, 'tools', 'list'], {
    hermesHome,
    env: LIST_ENV,
  });
  const enabled = enabledToolsetIds(tools.stdout);
  if (enabled.length > 0) {
    log(`Disabling ${enabled.length} toolsets on the eval-base profile.`);
    await run(executable, ['-p', EVAL_PROFILE, 'tools', 'disable', ...enabled], { hermesHome });
  }
  if (!memoryIsDisabled(await readText(configPath))) {
    log('Disabling memory on the eval-base profile.');
    await run(executable, ['-p', EVAL_PROFILE, 'config', 'set', 'memory.memory_enabled', 'false'], {
      hermesHome,
    });
    await run(
      executable,
      ['-p', EVAL_PROFILE, 'config', 'set', 'memory.user_profile_enabled', 'false'],
      { hermesHome },
    );
  }
  const skillMarker = path.join(profileDir, SKILLS_OPT_OUT);
  if (!existsSync(skillMarker) || profileHasSkillFiles(profileDir)) {
    log('Removing bundled skills from the eval-base profile.');
    await run(executable, ['-p', EVAL_PROFILE, 'skills', 'opt-out', '--remove', '-y'], {
      hermesHome,
    });
  }
  const restrictedTools = await run(executable, ['-p', EVAL_PROFILE, 'tools', 'list'], {
    hermesHome,
    env: LIST_ENV,
  });
  const stillEnabled = enabledToolsetIds(restrictedTools.stdout);
  if (stillEnabled.length > 0) {
    throw new Error(
      `The eval-base profile still has enabled toolsets: ${stillEnabled.join(', ')}.`,
    );
  }
  const restrictedSkills = await run(executable, ['-p', EVAL_PROFILE, 'skills', 'list'], {
    hermesHome,
    env: LIST_ENV,
  });
  if (!skillsListIsEmpty(restrictedSkills.stdout)) {
    throw new Error('The eval-base profile still has enabled skills.');
  }
  if (!memoryIsDisabled(await readText(configPath))) {
    throw new Error('The eval-base profile still has memory enabled.');
  }
  const model = await run(executable, ['-p', EVAL_PROFILE, 'config', 'get', 'model', '--json'], {
    hermesHome,
  });
  if (!modelMatches(parseModelJson(model.stdout))) {
    throw new Error('Restricting eval-base changed its provider or model.');
  }
}

function profileHasSkillFiles(profileDir) {
  const skillsDir = path.join(profileDir, 'skills');
  if (!existsSync(skillsDir)) {
    return false;
  }
  return walkHasSkill(skillsDir);
}

function walkHasSkill(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (entry === 'SKILL.md') {
      return true;
    }
    if (statSync(fullPath).isDirectory() && walkHasSkill(fullPath)) {
      return true;
    }
  }
  return false;
}

async function verifyApiKey(executable, hermesHome, apiKey, run, log) {
  const profileDir = path.join(hermesHome, 'profiles', EVAL_PROFILE);
  const marker = path.join(profileDir, KEY_MARKER);
  const digest = keyHash(apiKey);
  if ((await readText(marker)).trim() === digest) {
    log('Hermes already accepted this OpenAI API key.');
    return;
  }
  const isolatedId = `e${randomBytes(4).toString('hex')}`;
  const isolatedDir = path.join(hermesHome, 'profiles', isolatedId);
  log('Checking that Hermes can call OpenAI with the eval-base profile.');
  try {
    await copyProfile(profileDir, isolatedDir);
    await run(
      executable,
      [
        '-p',
        isolatedId,
        '-m',
        EVAL_MODEL,
        '--provider',
        EVAL_PROVIDER,
        '-z',
        'Reply with the single word ok.',
      ],
      { hermesHome, cwd: process.env.TMPDIR || '/tmp', timeoutMs: 120_000, streamStderr: true },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hermes could not complete a request.';
    throw new Error(
      `Hermes could not complete a minimal request with the configured OpenAI API key. ${redact(message, [apiKey])}`,
      { cause: error },
    );
  } finally {
    await run(executable, ['profile', 'delete', isolatedId, '-y'], { hermesHome }).catch(
      () => undefined,
    );
    await rm(isolatedDir, { recursive: true, force: true });
  }
  await writeFile(marker, `${digest}\n`, { mode: 0o600 });
  log('Hermes completed a minimal request.');
}

export async function bootstrap(repoRoot, { run, log }) {
  assertSupportedNode(process.versions.node);
  const npm = await run('npm', ['--version'], {});
  assertSupportedNpm(npm.stdout.trim());
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) {
    throw new Error(
      'No .env file was found. Copy .env.example to .env in the repository root, set OPENAI_API_KEY, and run npm run dev again.',
    );
  }
  const apiKey = requireOpenAiKey(readDotenv(await readFile(envPath, 'utf8')));
  addRedactedSecret(apiKey);
  await ensureDependencies(repoRoot, run, log);
  const hermesHome = projectHermesHome(repoRoot);
  await mkdir(hermesHome, { recursive: true });
  const executable = await resolveHermes(repoRoot, run, log);
  process.env.HERMES_EXECUTABLE = executable;
  process.env.HERMES_HOME = hermesHome;
  await ensureProfile(executable, hermesHome, apiKey, run, log);
  await verifyApiKey(executable, hermesHome, apiKey, run, log);
  log('Applying database migrations.');
  await run('npm', ['run', 'db:deploy', '-w', '@eval/api'], { cwd: repoRoot, inherit: true });
  log('Loading demo data.');
  await run('npm', ['run', 'db:seed', '-w', '@eval/api'], { cwd: repoRoot, inherit: true });
}
