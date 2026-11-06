import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { assertReadOnlyHermesArgs, runCapturedHermesCommand } from './hermes-command';
import { projectHermesHome } from './hermes-home';

describe('Hermes command capture', () => {
  it('refuses commands that would change a profile', () => {
    expect(() => assertReadOnlyHermesArgs(['-p', 'eval-base', 'tools', 'enable', 'web'])).toThrow();
    expect(() => assertReadOnlyHermesArgs(['profile', 'use', 'eval-base'])).toThrow();
    expect(() => assertReadOnlyHermesArgs(['-p', 'eval-base', 'skills', 'list'])).not.toThrow();
  });

  it('returns a non-zero exit without keeping stdout or stderr', async () => {
    const { child, stdout, stderr } = fakeChild();
    const result = runCapturedHermesCommand({
      executable: '/usr/bin/hermes',
      args: ['--version'],
      spawnImpl: () => {
        queueMicrotask(() => {
          stdout.end('sk-secret-in-stdout');
          stderr.end('sk-secret-in-stderr');
          child.emit('close', 2);
        });
        return child;
      },
    });

    await expect(result).resolves.toMatchObject({
      stdout: '',
      exitCode: 2,
      timedOut: false,
      launchFailed: false,
    });
    expect(JSON.stringify(await result)).not.toContain('sk-secret');
  });

  it('strips terminal control characters from successful output', async () => {
    const { child, stdout } = fakeChild();
    const result = runCapturedHermesCommand({
      executable: '/usr/bin/hermes',
      args: ['profile', 'list'],
      spawnImpl: () => {
        queueMicrotask(() => {
          stdout.end('\u001b[32menabled\u001b[0m\r\n');
          child.emit('close', 0);
        });
        return child;
      },
    });

    await expect(result).resolves.toMatchObject({ stdout: 'enabled\n', exitCode: 0 });
  });

  it('reports a timeout without including command output', async () => {
    jest.useFakeTimers();
    const { child, stdout } = fakeChild();
    const pending = runCapturedHermesCommand({
      executable: '/usr/bin/hermes',
      args: ['--version'],
      timeoutMs: 25,
      spawnImpl: () => {
        stdout.write('sk-secret-timeout');
        return child;
      },
    });
    jest.advanceTimersByTime(30);
    child.emit('close', null);
    await expect(pending).resolves.toMatchObject({ stdout: '', timedOut: true });
    expect(JSON.stringify(await pending)).not.toContain('sk-secret');
    jest.useRealTimers();
  });

  it('reports an output limit without returning the captured text', async () => {
    const { child, stdout } = fakeChild();
    const result = runCapturedHermesCommand({
      executable: '/usr/bin/hermes',
      args: ['--version'],
      maxBytes: 4,
      spawnImpl: () => {
        queueMicrotask(() => {
          stdout.write('secret-output');
          child.emit('close', null);
        });
        return child;
      },
    });

    await expect(result).resolves.toMatchObject({ stdout: '', outputLimitExceeded: true });
    expect(JSON.stringify(await result)).not.toContain('secret-output');
  });

  it('selects the project Hermes home instead of the personal home', async () => {
    const previous = process.env.HERMES_HOME;
    process.env.HERMES_HOME = path.join(homedir(), '.hermes');
    try {
      let hermesHome = '';
      const { child } = fakeChild();
      await runCapturedHermesCommand({
        executable: '/usr/bin/hermes',
        args: ['--version'],
        spawnImpl: (_command, _args, options) => {
          hermesHome = String(options.env?.HERMES_HOME);
          queueMicrotask(() => child.emit('close', 0));
          return child;
        },
      });
      expect(hermesHome).toBe(projectHermesHome(__dirname));
      expect(hermesHome).not.toBe(path.join(homedir(), '.hermes'));
    } finally {
      if (previous === undefined) {
        delete process.env.HERMES_HOME;
      } else {
        process.env.HERMES_HOME = previous;
      }
    }
  });
});

function fakeChild(): { child: ChildProcess; stdout: PassThrough; stderr: PassThrough } {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = new EventEmitter() as ChildProcess;
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  return { child, stdout, stderr };
}
