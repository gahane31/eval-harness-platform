import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import {
  HERMES_CAPTURE_COLUMNS,
  HERMES_COMMAND_TIMEOUT_MS,
  HERMES_MAX_OUTPUT_BYTES,
} from './hermes.constants';
import { sanitizeTerminalText } from './terminal-text';

const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class HermesLaunchError extends Error {
  constructor(readonly code: 'EXECUTABLE_NOT_FOUND' | 'COMMAND_FAILED') {
    super(code);
    this.name = 'HermesLaunchError';
  }
}

export interface HermesCommandResult {
  stdout: string;
  exitCode: number | null;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  launchFailed: boolean;
}

export const HERMES_COMMANDS = Symbol('HERMES_COMMANDS');

export interface HermesCommandRunner {
  run(args: readonly string[]): Promise<HermesCommandResult>;
}

type SpawnImpl = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export function assertReadOnlyHermesArgs(args: readonly string[]): void {
  if (
    same(args, ['--version']) ||
    same(args, ['profile']) ||
    same(args, ['profile', 'list']) ||
    isScopedRead(args)
  ) {
    return;
  }
  throw new HermesLaunchError('COMMAND_FAILED');
}

export async function resolveHermesExecutable(configured: string | undefined): Promise<string> {
  if (configured !== undefined) {
    if (!configured.startsWith('/') || configured.includes('\0')) {
      throw new HermesLaunchError('EXECUTABLE_NOT_FOUND');
    }
    try {
      await access(configured, constants.X_OK);
    } catch {
      throw new HermesLaunchError('EXECUTABLE_NOT_FOUND');
    }
    return configured;
  }

  try {
    const found = await new Promise<string>((resolve, reject) => {
      execFile('/usr/bin/which', ['hermes'], { shell: false, timeout: 5_000 }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });
    const executable = found.trim();
    if (!executable.startsWith('/') || executable.includes('\0')) {
      throw new HermesLaunchError('EXECUTABLE_NOT_FOUND');
    }
    return executable;
  } catch (error) {
    if (error instanceof HermesLaunchError) {
      throw error;
    }
    throw new HermesLaunchError('EXECUTABLE_NOT_FOUND');
  }
}

export async function runCapturedHermesCommand(input: {
  executable: string;
  args: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
  spawnImpl?: SpawnImpl;
}): Promise<HermesCommandResult> {
  assertReadOnlyHermesArgs(input.args);
  const spawnImpl = input.spawnImpl ?? spawn;
  const timeoutMs = input.timeoutMs ?? HERMES_COMMAND_TIMEOUT_MS;
  const maxBytes = input.maxBytes ?? HERMES_MAX_OUTPUT_BYTES;
  const child = spawnImpl(input.executable, input.args, {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      COLUMNS: String(HERMES_CAPTURE_COLUMNS),
      LINES: '200',
      TERM: 'xterm-256color',
    },
  });

  let timedOut = false;
  let outputLimitExceeded = false;
  let launchFailed = false;
  let exitCode: number | null = null;
  const stdout: Buffer[] = [];
  let received = 0;

  const outcome = await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        outputLimitExceeded = true;
        stdout.length = 0;
        child.kill('SIGKILL');
        return;
      }
      stdout.push(chunk);
    });
    child.stderr?.on('data', () => undefined);
    child.on('error', () => {
      launchFailed = true;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      exitCode = code;
      resolve();
    });
  });
  void outcome;

  const readable = !timedOut && !outputLimitExceeded && !launchFailed && exitCode === 0;
  return {
    stdout: readable ? sanitizeTerminalText(Buffer.concat(stdout).toString('utf8')) : '',
    exitCode,
    timedOut,
    outputLimitExceeded,
    launchFailed,
  };
}

function isScopedRead(args: readonly string[]): boolean {
  if (args.length < 4 || args[0] !== '-p' || !isProfileId(args[1])) {
    return false;
  }
  const command = args.slice(2);
  return (
    same(command, ['skills', 'list']) ||
    same(command, ['tools', 'list']) ||
    same(command, ['config', 'get', 'model', '--json'])
  );
}

function isProfileId(value: string | undefined): value is string {
  return typeof value === 'string' && PROFILE_ID.test(value);
}

function same(args: readonly string[], expected: readonly string[]): boolean {
  return args.length === expected.length && args.every((value, index) => value === expected[index]);
}
