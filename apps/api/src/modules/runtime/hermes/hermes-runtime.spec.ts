import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { HermesCommandResult, HermesCommandRunner } from './hermes-command';
import { HermesRuntime } from './hermes-runtime';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('HermesRuntime', () => {
  it('keeps each profile catalogue separate and does not mutate profiles', async () => {
    const calls: string[][] = [];
    const runtime = runtimeWith(async (args) => {
      calls.push([...args]);
      return ok(outputFor(args));
    });

    const defaults = await runtime.getSkills({ profile: 'default' });
    const evalBase = await runtime.getSkills({ profile: 'eval-base' });

    expect(defaults.skills.some((skill) => skill.id === 'apple-notes')).toBe(true);
    expect(evalBase.skills.map((skill) => skill.id)).toEqual(['hermes-agent']);
    expect(evalBase.discoveryErrors).toEqual([]);
    expect(calls.some((args) => args.join(' ') === '-p eval-base skills list')).toBe(true);
    expect(
      calls.some(
        (args) => args.includes('enable') || args.includes('disable') || args.includes('use'),
      ),
    ).toBe(false);
  });

  it('returns an explicit error for unknown output and command failures without logging output', async () => {
    const logs: string[] = [];
    const runtime = runtimeWith(async (args) => {
      if (args.includes('skills')) {
        return ok('sk-secret-not-a-table');
      }
      if (args.includes('tools')) {
        return { ...ok(''), exitCode: 7, stdout: 'sk-secret-stderr-lookalike' };
      }
      return ok(outputFor(args));
    });
    runtime.diagnostics = (event) => {
      logs.push(JSON.stringify(event));
    };

    const skills = await runtime.getSkills({ profile: 'default' });
    const toolsets = await runtime.getToolsets({ profile: 'default' });

    expect(skills.skills).toEqual([]);
    expect(skills.discoveryErrors).toEqual([
      expect.objectContaining({ capability: 'skills', code: 'UNSUPPORTED_OUTPUT' }),
    ]);
    expect(toolsets.toolsets).toEqual([]);
    expect(toolsets.discoveryErrors[0]).toMatchObject({ code: 'COMMAND_FAILED', exitCode: 7 });
    expect(JSON.stringify(skills)).not.toContain('sk-secret');
    expect(JSON.stringify(toolsets)).not.toContain('sk-secret');
    expect(logs.join('\n')).not.toContain('sk-secret');
    expect(logs.join('\n')).toContain('UNSUPPORTED_OUTPUT');
  });

  it('does not keep a successful catalogue after a failed refresh', async () => {
    let failSkills = false;
    const runtime = runtimeWith(async (args) => {
      if (failSkills && args.includes('skills')) {
        return { ...ok(''), exitCode: 1 };
      }
      return ok(outputFor(args));
    });

    const first = await runtime.getSkills({ profile: 'default' });
    expect(first.skills.length).toBeGreaterThan(0);

    failSkills = true;
    const refreshed = await runtime.getSkills({ profile: 'default', refresh: true });
    expect(refreshed.skills).toEqual([]);
    expect(refreshed.discoveryErrors[0]?.code).toBe('COMMAND_FAILED');

    const cached = await runtime.getSkills({ profile: 'default' });
    expect(cached.cached).toBe(true);
    expect(cached.skills).toEqual([]);
    expect(cached.discoveryErrors[0]?.code).toBe('COMMAND_FAILED');
  });
});

function runtimeWith(run: HermesCommandRunner['run']): HermesRuntime {
  return new HermesRuntime({ run });
}

function ok(stdout: string): HermesCommandResult {
  return { stdout, exitCode: 0, timedOut: false, outputLimitExceeded: false, launchFailed: false };
}

function outputFor(args: readonly string[]): string {
  const command = args.join(' ');
  if (command === '--version') {
    return fixture('version.txt');
  }
  if (command === 'profile list') {
    return fixture('profile-list.txt');
  }
  if (command === 'profile') {
    return fixture('profile-status.txt');
  }
  if (command === '-p default skills list') {
    return fixture('skills-default.txt');
  }
  if (command === '-p eval-base skills list') {
    return fixture('skills-eval-base.txt');
  }
  if (command === '-p default tools list') {
    return fixture('tools-default.txt');
  }
  if (command === '-p eval-base tools list') {
    return fixture('tools-eval-base.txt');
  }
  if (command.endsWith('config get model --json')) {
    return fixture('model-eval-base.json');
  }
  throw new Error(`Unexpected Hermes command: ${command}`);
}
