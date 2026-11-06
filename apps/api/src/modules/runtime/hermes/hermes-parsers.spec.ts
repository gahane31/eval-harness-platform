import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseModelConfig } from './parse-model';
import { parseActiveProfile, parseProfileList } from './parse-profiles';
import { parseSkillsList } from './parse-skills';
import { parseToolsetsList } from './parse-toolsets';
import { parseHermesVersion } from './parse-version';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('Hermes output parsers', () => {
  it('parses the installed version and rejects an unknown format', () => {
    expect(parseHermesVersion(fixture('version.txt'))).toMatchObject({
      version: '0.22.7',
      supported: true,
    });
    expect(parseHermesVersion('hermes 1').supported).toBe(false);
    expect(parseHermesVersion('Hermes Agent v9.9.9 (test)').supported).toBe(false);
  });

  it('parses profile-scoped skill fixtures and rejects truncated names', () => {
    const defaults = parseSkillsList(fixture('skills-default.txt'));
    const evalBase = parseSkillsList(fixture('skills-eval-base.txt'));

    expect(defaults.map((skill) => skill.id)).toContain('songwriting-and-ai-music');
    expect(defaults.map((skill) => skill.id)).toContain('document-to-action-items');
    expect(evalBase.map((skill) => skill.id)).toEqual(['hermes-agent']);
    expect(evalBase[0]).toMatchObject({
      source: 'builtin',
      installed: true,
      enabled: true,
      configurable: false,
    });
    expect(defaults.some((skill) => skill.id === 'apple-notes')).toBe(true);
    expect(evalBase.some((skill) => skill.id === 'apple-notes')).toBe(false);
    expect(() => parseSkillsList(fixture('skills-pipe-truncated.txt'))).toThrow(/truncated/);
    expect(() => parseSkillsList('no table here')).toThrow(/expected format/);
  });

  it('parses profile-specific toolset enablement', () => {
    const defaults = parseToolsetsList(fixture('tools-default.txt'));
    const evalBase = parseToolsetsList(fixture('tools-eval-base.txt'));
    const memoryOnDefault = defaults.find((toolset) => toolset.id === 'memory');
    const memoryOnEval = evalBase.find((toolset) => toolset.id === 'memory');

    expect(memoryOnDefault).toMatchObject({ enabled: false, available: true, configurable: false });
    expect(memoryOnEval).toMatchObject({ enabled: true, available: true, configurable: false });
    expect(() => parseToolsetsList('not a tool list')).toThrow(/expected format/);
  });

  it('parses profiles and ignores credential-bearing model config fields', () => {
    const profiles = parseProfileList(fixture('profile-list.txt'));
    expect(profiles.map((profile) => profile.id)).toEqual(['default', 'eval-base']);
    expect(parseActiveProfile(fixture('profile-status.txt'))).toBe('default');

    const providers = parseModelConfig(fixture('model-eval-base.json'));
    expect(providers).toEqual([
      {
        provider: 'openai-api',
        models: [
          {
            id: 'gpt-5.4-mini',
            name: 'gpt-5.4-mini',
            availability: 'unknown',
            limitation: expect.any(String),
          },
        ],
      },
    ]);
    expect(JSON.stringify(providers)).not.toContain('base_url');
    expect(JSON.stringify(providers)).not.toContain('api.openai.com');
  });
});
