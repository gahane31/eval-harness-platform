import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap, redact } from './bootstrap.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = new Set();
let shuttingDown = false;
let signals = 0;

function stop(signal) {
  for (const child of children) {
    if (!child.pid) {
      continue;
    }
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  }
}

function onSignal(signal) {
  signals += 1;
  shuttingDown = true;
  stop(signals > 1 ? 'SIGKILL' : signal);
  if (children.size === 0) {
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }
}

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...options.env };
    if (options.stripHermesHome) {
      delete env.HERMES_HOME;
    } else if (options.hermesHome) {
      env.HERMES_HOME = options.hermesHome;
    }
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env,
      shell: false,
      detached: true,
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch {
              child.kill('SIGKILL');
            }
          }, options.timeoutMs);
    if (!options.inherit) {
      child.stdout?.on('data', (chunk) => stdout.push(chunk));
      child.stderr?.on('data', (chunk) => {
        stderr.push(chunk);
        if (options.streamStderr) {
          process.stderr.write(redact(chunk.toString('utf8')));
        }
      });
    }
    child.on('error', (error) => {
      clearTimeout(timer);
      children.delete(child);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      children.delete(child);
      if (shuttingDown) {
        reject(new Error('Setup was interrupted.'));
        return;
      }
      if (timedOut) {
        reject(new Error(`${command} timed out.`));
        return;
      }
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code: code ?? 1,
      };
      if (code !== 0) {
        const detail = redact(`${result.stderr}\n${result.stdout}`).trim().slice(0, 2_000);
        reject(
          new Error(
            detail
              ? `${command} exited with code ${code}.\n${detail}`
              : `${command} exited with code ${code}.`,
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

try {
  await bootstrap(repoRoot, { run, log: (message) => console.log(message) });
  if (shuttingDown || process.argv.includes('--setup-only')) {
    process.exit(shuttingDown ? 130 : 0);
  }
  console.log('Starting the API and web app.');
  const app = spawn('npm', ['run', 'dev:apps'], {
    cwd: repoRoot,
    env: process.env,
    shell: false,
    detached: true,
    stdio: 'inherit',
  });
  children.add(app);
  app.on('exit', (code) => {
    process.exit(shuttingDown ? 130 : (code ?? 1));
  });
} catch (error) {
  if (!shuttingDown) {
    const message = error instanceof Error ? error.message : 'Setup failed.';
    console.error(redact(message));
  }
  process.exit(shuttingDown ? 130 : 1);
}
