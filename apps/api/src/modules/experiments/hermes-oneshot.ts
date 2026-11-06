import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HERMES_MAX_OUTPUT_BYTES } from '../runtime/hermes/hermes.constants';
import { resolveHermesExecutable } from '../runtime/hermes/hermes-command';
import {
  createIsolatedProfile,
  deleteIsolatedProfile,
  projectHermesHome,
} from '../runtime/hermes/hermes-home';

/** Process limit for one Hermes run. Experiment.timeoutSeconds is not this value. */
export const HERMES_EXECUTION_TIMEOUT_MS = 180_000;
export const HERMES_ONESHOT = Symbol('HERMES_ONESHOT');

const USAGE_FIELDS = [
  'session_id',
  'completed',
  'partial',
  'interrupted',
  'turn_exit_reason',
  'api_calls',
  'total_tokens',
  'input_tokens',
  'output_tokens',
  'reasoning_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'estimated_cost_usd',
  'cost_status',
  'cost_source',
  'model',
  'provider',
] as const;

type UsageField = (typeof USAGE_FIELDS)[number];

export interface HermesUsageReport {
  session_id?: string;
  completed?: boolean;
  partial?: boolean;
  interrupted?: boolean;
  turn_exit_reason?: string;
  api_calls?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  estimated_cost_usd?: number | null;
  cost_status?: string;
  cost_source?: string;
  model?: string;
  provider?: string;
}

export interface HermesOneshotRequest {
  profileId: string;
  provider: string;
  model: string;
  reasoning?: string;
  systemPrompt: string;
  prompt: string;
  timeoutMs: number;
}

export interface HermesOneshotResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  launchFailed: boolean;
  outputLimitExceeded: boolean;
  durationMs: number;
  usage: HermesUsageReport | null;
  usageError: string | null;
}

export interface HermesOneshotRunner {
  execute(request: HermesOneshotRequest): Promise<HermesOneshotResult>;
}

type SpawnImpl = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export function hermesOneshotArgs(
  request: HermesOneshotRequest,
  usageFile: string,
  profileId = request.profileId,
): string[] {
  const args = ['-p', profileId, '-m', request.model, '--provider', request.provider];
  if (request.reasoning !== undefined && request.reasoning.length > 0) {
    args.push('--reasoning', request.reasoning);
  }
  args.push('-z', request.prompt, '--usage-file', usageFile);
  return args;
}

export function selectUsageReport(value: unknown): HermesUsageReport | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const report: HermesUsageReport = {};
  for (const field of USAGE_FIELDS) {
    const copied = copyUsageField(field, source[field]);
    if (copied !== undefined) {
      report[field] = copied as never;
    }
  }
  return report;
}

export async function runHermesOneshot(
  request: HermesOneshotRequest,
  dependencies: {
    executable: string;
    spawnImpl?: SpawnImpl;
    maxBytes?: number;
    hermesHome?: string;
    executionProfileId?: string;
  },
): Promise<HermesOneshotResult> {
  const directory = await mkdtemp(path.join(tmpdir(), 'eval-hermes-'));
  const usageFile = path.join(directory, 'usage.json');
  const started = Date.now();
  try {
    const captured = await captureProcess(request, usageFile, dependencies);
    const usage = await readUsageFile(usageFile);
    return {
      ...captured,
      ...usage,
      durationMs: Date.now() - started,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

@Injectable()
export class HermesOneshotProcess implements HermesOneshotRunner {
  private readonly logger = new Logger(HermesOneshotProcess.name);
  private executable: string | null = null;

  constructor(private readonly config: ConfigService) {}

  async execute(request: HermesOneshotRequest): Promise<HermesOneshotResult> {
    const hermesHome = projectHermesHome(__dirname);
    let executable: string | null = null;
    let isolatedId: string | null = null;
    let isolatedDirectory: string | null = null;
    try {
      executable = await this.executablePath();
      const isolated = await createIsolatedProfile(hermesHome, request.profileId);
      isolatedId = isolated.profileId;
      isolatedDirectory = isolated.directory;
      return await runHermesOneshot(request, {
        executable,
        hermesHome,
        executionProfileId: isolated.profileId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hermes could not be started.';
      this.logger.error(message);
      return {
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: false,
        launchFailed: true,
        outputLimitExceeded: false,
        durationMs: 0,
        usage: null,
        usageError: null,
      };
    } finally {
      if (executable && isolatedId) {
        await deleteIsolatedProfile({ executable, hermesHome, profileId: isolatedId });
      }
      if (isolatedDirectory) {
        await rm(isolatedDirectory, { recursive: true, force: true });
      }
    }
  }

  private async executablePath(): Promise<string> {
    if (this.executable) {
      return this.executable;
    }
    const executable = await resolveHermesExecutable(this.config.get<string>('HERMES_EXECUTABLE'));
    this.executable = executable;
    return executable;
  }
}

function copyUsageField(
  field: UsageField,
  value: unknown,
): HermesUsageReport[UsageField] | undefined {
  if (field === 'completed' || field === 'partial' || field === 'interrupted') {
    return typeof value === 'boolean' ? value : undefined;
  }
  if (field === 'estimated_cost_usd') {
    if (value === null) {
      return null;
    }
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
  if (
    field === 'api_calls' ||
    field === 'total_tokens' ||
    field === 'input_tokens' ||
    field === 'output_tokens' ||
    field === 'reasoning_tokens' ||
    field === 'cache_read_tokens' ||
    field === 'cache_write_tokens'
  ) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

async function readUsageFile(
  usageFile: string,
): Promise<{ usage: HermesUsageReport | null; usageError: string | null }> {
  let raw: string;
  try {
    raw = await readFile(usageFile, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { usage: null, usageError: 'Hermes did not write a usage report.' };
    }
    return { usage: null, usageError: 'Hermes usage report could not be read.' };
  }
  try {
    const usage = selectUsageReport(JSON.parse(raw) as unknown);
    if (!usage) {
      return { usage: null, usageError: 'Hermes usage report could not be read.' };
    }
    return { usage, usageError: null };
  } catch {
    return { usage: null, usageError: 'Hermes usage report could not be read.' };
  }
}

async function captureProcess(
  request: HermesOneshotRequest,
  usageFile: string,
  dependencies: {
    executable: string;
    spawnImpl?: SpawnImpl;
    maxBytes?: number;
    hermesHome?: string;
    executionProfileId?: string;
  },
): Promise<
  Pick<
    HermesOneshotResult,
    'stdout' | 'stderr' | 'exitCode' | 'timedOut' | 'launchFailed' | 'outputLimitExceeded'
  >
> {
  const spawnImpl = dependencies.spawnImpl ?? spawn;
  const maxBytes = dependencies.maxBytes ?? HERMES_MAX_OUTPUT_BYTES;
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.HERMES_EPHEMERAL_SYSTEM_PROMPT;
  env.HERMES_HOME = dependencies.hermesHome ?? projectHermesHome(__dirname);
  if (request.systemPrompt.length > 0) {
    env.HERMES_EPHEMERAL_SYSTEM_PROMPT = request.systemPrompt;
  }
  const child = spawnImpl(
    dependencies.executable,
    hermesOneshotArgs(request, usageFile, dependencies.executionProfileId),
    {
      cwd: tmpdir(),
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let timedOut = false;
  let launchFailed = false;
  let outputLimitExceeded = false;
  let exitCode: number | null = null;
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let killTimer: ReturnType<typeof setTimeout> | undefined;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 2_000);
    }, request.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      pushChunk(stdout, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      pushChunk(stderr, chunk);
    });
    child.on('error', () => {
      launchFailed = true;
      finish();
    });
    child.on('close', (code) => {
      exitCode = code;
      finish();
    });

    function pushChunk(target: Buffer[], chunk: Buffer): void {
      if (outputLimitExceeded) {
        return;
      }
      const received = target.reduce((sum, item) => sum + item.length, 0) + chunk.length;
      if (received > maxBytes) {
        outputLimitExceeded = true;
        stdout.length = 0;
        stderr.length = 0;
        child.kill('SIGKILL');
        return;
      }
      target.push(chunk);
    }
  });

  const readable = !outputLimitExceeded;
  return {
    stdout: readable ? Buffer.concat(stdout).toString('utf8') : '',
    stderr: readable ? Buffer.concat(stderr).toString('utf8') : '',
    exitCode,
    timedOut,
    launchFailed,
    outputLimitExceeded,
  };
}
