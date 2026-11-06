import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HermesRuntime } from './hermes-runtime';
import { resolveHermesExecutable, runCapturedHermesCommand } from './hermes-command';
import { projectHermesHome } from './hermes-home';

const live = process.env.HERMES_LIVE_CHECK === '1' ? describe : describe.skip;
const PROJECT_CONFIG = join(projectHermesHome(__dirname), 'profiles', 'eval-base', 'config.yaml');
const CONFIG_PATHS = [
  PROJECT_CONFIG,
  join(homedir(), '.hermes', 'config.yaml'),
  join(homedir(), '.hermes', 'profiles', 'eval-base', 'config.yaml'),
].filter((configPath) => existsSync(configPath));

live('installed Hermes discovery', () => {
  it('reads the project eval-base profile without changing Hermes config files', async () => {
    if (!existsSync(PROJECT_CONFIG)) {
      throw new Error(
        'Project Hermes profile eval-base is missing. Run npm run dev once, then retry.',
      );
    }
    const before = await Promise.all(CONFIG_PATHS.map(fingerprint));
    const executable = await resolveHermesExecutable(process.env.HERMES_EXECUTABLE);
    const runtime = new HermesRuntime({
      run: (args) => runCapturedHermesCommand({ executable, args }),
    });
    runtime.diagnostics = () => undefined;

    const profiles = await runtime.getProfiles({ refresh: true });
    expect(profiles.discoveryErrors).toEqual([]);
    expect(profiles.profiles.map((profile) => profile.id)).toEqual(
      expect.arrayContaining(['eval-base']),
    );

    const [evalSkills, evalTools, evalModels] = await Promise.all([
      runtime.getSkills({ profile: 'eval-base', refresh: true }),
      runtime.getToolsets({ profile: 'eval-base', refresh: true }),
      runtime.getModels({ profile: 'eval-base', refresh: true }),
    ]);

    expect(evalSkills.discoveryErrors).toEqual([]);
    expect(evalSkills.skills.filter((skill) => skill.enabled)).toEqual([]);

    expect(evalTools.discoveryErrors).toEqual([]);
    expect(evalTools.toolsets.find((toolset) => toolset.id === 'memory')?.enabled).toBe(false);
    expect(evalTools.toolsets.filter((toolset) => toolset.enabled)).toEqual([]);
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
