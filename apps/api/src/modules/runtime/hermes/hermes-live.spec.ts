import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HermesRuntime } from './hermes-runtime';
import { resolveHermesExecutable, runCapturedHermesCommand } from './hermes-command';

const live = process.env.HERMES_LIVE_CHECK === '1' ? describe : describe.skip;
const CONFIG_PATHS = [
  join(homedir(), '.hermes', 'config.yaml'),
  join(homedir(), '.hermes', 'profiles', 'eval-base', 'config.yaml'),
];

live('installed Hermes discovery', () => {
  it('keeps profile catalogues separate without changing Hermes config files', async () => {
    const before = await Promise.all(CONFIG_PATHS.map(fingerprint));
    const executable = await resolveHermesExecutable(process.env.HERMES_EXECUTABLE);
    const runtime = new HermesRuntime({
      run: (args) => runCapturedHermesCommand({ executable, args }),
    });
    runtime.diagnostics = () => undefined;

    const profiles = await runtime.getProfiles({ refresh: true });
    expect(profiles.discoveryErrors).toEqual([]);
    expect(profiles.profiles.map((profile) => profile.id)).toEqual(
      expect.arrayContaining(['default', 'eval-base']),
    );

    const [defaultSkills, evalSkills, defaultTools, evalTools, evalModels] = await Promise.all([
      runtime.getSkills({ profile: 'default', refresh: true }),
      runtime.getSkills({ profile: 'eval-base', refresh: true }),
      runtime.getToolsets({ profile: 'default', refresh: true }),
      runtime.getToolsets({ profile: 'eval-base', refresh: true }),
      runtime.getModels({ profile: 'eval-base', refresh: true }),
    ]);

    expect(defaultSkills.discoveryErrors).toEqual([]);
    expect(evalSkills.discoveryErrors).toEqual([]);
    expect(defaultSkills.skills.some((skill) => skill.id === 'apple-notes')).toBe(true);
    expect(evalSkills.skills.map((skill) => skill.id)).toEqual(['hermes-agent']);
    expect(
      evalSkills.skills.every(
        (skill) => skill.configurable === false && skill.source === 'builtin',
      ),
    ).toBe(true);

    expect(defaultTools.discoveryErrors).toEqual([]);
    expect(evalTools.discoveryErrors).toEqual([]);
    expect(defaultTools.toolsets.find((toolset) => toolset.id === 'memory')?.enabled).toBe(false);
    expect(evalTools.toolsets.find((toolset) => toolset.id === 'memory')?.enabled).toBe(true);
    expect(evalTools.toolsets.every((toolset) => toolset.configurable === false)).toBe(true);

    expect(evalModels.discoveryErrors).toEqual([]);
    expect(evalModels.providers).toEqual([
      {
        provider: 'openai-api',
        models: [
          expect.objectContaining({
            id: 'gpt-5.4-mini',
            availability: 'unknown',
          }),
        ],
      },
    ]);
    expect(JSON.stringify(evalModels)).not.toContain('base_url');

    const after = await Promise.all(CONFIG_PATHS.map(fingerprint));
    expect(after).toEqual(before);
  }, 120_000);
});

async function fingerprint(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}
