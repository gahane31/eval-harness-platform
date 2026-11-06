import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { hermesOneshotArgs, runHermesOneshot, type HermesOneshotRequest } from './hermes-oneshot';

const request: HermesOneshotRequest = {
  profileId: 'eval-base',
  provider: 'openai-api',
  model: 'gpt-5.4-mini',
  reasoning: 'medium',
  systemPrompt: 'Reply briefly.',
  prompt: 'What city is the Eiffel Tower in?',
  timeoutMs: 1_000,
};

function fakeChild(): {
  child: ChildProcess;
  stdout: PassThrough;
  stderr: PassThrough;
  signals: Array<NodeJS.Signals | undefined>;
} {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const signals: Array<NodeJS.Signals | undefined> = [];
  const child = Object.assign(emitter, {
    stdout,
    stderr,
    stdin: null,
    killed: false,
    exitCode: null,
    kill(signal?: NodeJS.Signals) {
      signals.push(signal);
      this.killed = true;
      setImmediate(() => emitter.emit('close', null, signal ?? null));
      return true;
    },
  });
  return { child: child as unknown as ChildProcess, stdout, stderr, signals };
}

describe('Hermes oneshot', () => {
  it('passes the published profile, model, provider, reasoning, prompt, and system prompt', async () => {
    let usagePath = '';
    let command = '';
    let args: readonly string[] = [];
    let options: SpawnOptions = {};
    const result = await runHermesOneshot(request, {
      executable: '/usr/bin/hermes',
      spawnImpl(spawnedCommand, spawnedArgs, spawnedOptions) {
        command = spawnedCommand;
        args = spawnedArgs;
        options = spawnedOptions;
        const index = spawnedArgs.indexOf('--usage-file');
        usagePath = String(spawnedArgs[index + 1]);
        writeFileSync(
          usagePath,
          JSON.stringify({
            session_id: 'local-abc',
            completed: true,
            model: 'gpt-5.4-mini',
            provider: 'openai-api',
            total_tokens: 3,
            api_key: 'should-not-stick',
          }),
        );
        const child = fakeChild();
        setImmediate(() => {
          child.stdout.write('Paris\n');
          child.stderr.write('');
          (child.child as unknown as EventEmitter).emit('close', 0, null);
        });
        return child.child;
      },
    });

    expect(command).toBe('/usr/bin/hermes');
    expect(args).toEqual(hermesOneshotArgs(request, usagePath));
    expect(args).toContain('-p');
    expect(args).toContain('eval-base');
    expect(args).not.toContain('json_field_equals');
    expect(options.shell).toBe(false);
    expect(options.cwd).toBe(tmpdir());
    expect(options.env?.HERMES_EPHEMERAL_SYSTEM_PROMPT).toBe('Reply briefly.');
    expect(result).toMatchObject({
      stdout: 'Paris\n',
      exitCode: 0,
      timedOut: false,
      usage: {
        session_id: 'local-abc',
        completed: true,
        model: 'gpt-5.4-mini',
        provider: 'openai-api',
        total_tokens: 3,
      },
    });
    expect(result.usage).not.toHaveProperty('api_key');
    await expect(access(usagePath)).rejects.toThrow();
  });

  it('omits reasoning and does not inherit an ambient system prompt', async () => {
    const previous = process.env.HERMES_EPHEMERAL_SYSTEM_PROMPT;
    process.env.HERMES_EPHEMERAL_SYSTEM_PROMPT = 'ambient prompt';
    try {
      let args: readonly string[] = [];
      let options: SpawnOptions = {};
      await runHermesOneshot(
        { ...request, reasoning: undefined, systemPrompt: '' },
        {
          executable: '/usr/bin/hermes',
          spawnImpl(_command, spawnedArgs, spawnedOptions) {
            args = spawnedArgs;
            options = spawnedOptions;
            const child = fakeChild();
            const index = spawnedArgs.indexOf('--usage-file');
            writeFileSync(
              String(spawnedArgs[index + 1]),
              JSON.stringify({ completed: true, session_id: 'local-empty' }),
            );
            setImmediate(() => (child.child as unknown as EventEmitter).emit('close', 0, null));
            return child.child;
          },
        },
      );
      expect(args).not.toContain('--reasoning');
      expect(args.slice(0, 2)).toEqual(['-p', 'eval-base']);
      expect(options.env?.HERMES_EPHEMERAL_SYSTEM_PROMPT).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.HERMES_EPHEMERAL_SYSTEM_PROMPT;
      } else {
        process.env.HERMES_EPHEMERAL_SYSTEM_PROMPT = previous;
      }
    }
  });

  it('terminates a process that exceeds the timeout', async () => {
    const child = fakeChild();
    const result = await runHermesOneshot(
      { ...request, timeoutMs: 20 },
      {
        executable: '/usr/bin/hermes',
        spawnImpl() {
          return child.child;
        },
      },
    );
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(child.signals).toContain('SIGTERM');
  });

  it('stops a process that exceeds the output limit', async () => {
    const child = fakeChild();
    const result = await runHermesOneshot(request, {
      executable: '/usr/bin/hermes',
      maxBytes: 4,
      spawnImpl() {
        setImmediate(() => child.stdout.write('hello world'));
        return child.child;
      },
    });
    expect(result.outputLimitExceeded).toBe(true);
    expect(result.stdout).toBe('');
    expect(child.signals).toContain('SIGKILL');
  });
});
