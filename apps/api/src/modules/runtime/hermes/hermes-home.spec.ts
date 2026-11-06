import { mkdtemp, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIsolatedProfile, deleteIsolatedProfile, projectHermesHome } from './hermes-home';

describe('project Hermes home', () => {
  it('keeps project state out of the personal Hermes directory', () => {
    const home = projectHermesHome(__dirname);
    expect(home.endsWith(`${path.sep}.hermes`)).toBe(true);
    expect(home.includes(`${path.sep}.hermes${path.sep}profiles`)).toBe(false);
  });

  it('gives each run a profile copy without sessions or memory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'eval-hermes-home-'));
    const source = path.join(root, 'profiles', 'eval-base');
    await mkdir(path.join(source, 'skills', 'demo'), { recursive: true });
    await mkdir(path.join(source, 'sessions'), { recursive: true });
    await mkdir(path.join(source, 'memories'), { recursive: true });
    await writeFile(path.join(source, 'config.yaml'), 'model:\n  default: gpt-5.4-mini\n');
    await writeFile(path.join(source, '.env'), 'OPENAI_API_KEY=test-key-value\n', { mode: 0o600 });
    await writeFile(path.join(source, 'SOUL.md'), 'soul\n');
    await writeFile(path.join(source, '.no-bundled-skills'), 'opt out\n');
    await writeFile(path.join(source, 'skills', 'demo', 'SKILL.md'), 'skill\n');
    await writeFile(path.join(source, 'sessions', 'session.txt'), 'session\n');
    await writeFile(path.join(source, 'memories', 'MEMORY.md'), 'remember\n');
    await writeFile(path.join(source, 'state.db'), 'db');
    const before = await readFile(path.join(source, 'config.yaml'));

    const first = await createIsolatedProfile(root, 'eval-base');
    const second = await createIsolatedProfile(root, 'eval-base');

    expect(first.profileId).not.toBe(second.profileId);
    expect(first.profileId).toMatch(/^e[0-9a-f]{8}$/);
    expect(first.profileId).not.toBe('eval-base');
    expect(first.directory.startsWith(path.join(root, 'profiles'))).toBe(true);
    expect(await readFile(path.join(first.directory, 'config.yaml'), 'utf8')).toContain(
      'gpt-5.4-mini',
    );
    expect(await readFile(path.join(first.directory, 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(
      'skill\n',
    );
    expect((await stat(path.join(first.directory, '.env'))).mode & 0o777).toBe(0o600);
    await expect(readFile(path.join(first.directory, 'sessions', 'session.txt'))).rejects.toThrow();
    await expect(readFile(path.join(first.directory, 'memories', 'MEMORY.md'))).rejects.toThrow();
    await expect(readFile(path.join(first.directory, 'state.db'))).rejects.toThrow();
    await writeFile(path.join(first.directory, 'sessions-note.txt'), 'only-first\n');
    await expect(readFile(path.join(second.directory, 'sessions-note.txt'))).rejects.toThrow();
    expect(await readFile(path.join(source, 'config.yaml'))).toEqual(before);
  });

  it('refuses to delete the shared eval-base profile', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'eval-hermes-home-'));
    await expect(
      deleteIsolatedProfile({
        executable: '/usr/bin/hermes',
        hermesHome: root,
        profileId: 'eval-base',
      }),
    ).rejects.toThrow(/eval-base/);
  });

  it('rejects a profile id that would escape the Hermes home', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'eval-hermes-home-'));
    await expect(createIsolatedProfile(root, '../escape')).rejects.toThrow(/valid profile name/);
  });
});
