import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, copyFile, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { findRepoRoot } from '../../../common/config/repo-root';

type SpawnImpl = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Files that define the profile. Session, memory, and state files are not copied. */
export const PROFILE_COPY_FILES = ['config.yaml', '.env', 'SOUL.md', '.no-bundled-skills'] as const;

export function projectHermesHome(startDir: string): string {
  return path.join(findRepoRoot(startDir), '.hermes');
}

export function assertProfileId(profileId: string): void {
  if (!PROFILE_ID.test(profileId)) {
    throw new Error(`Hermes profile id ${profileId} is not a valid profile name.`);
  }
}

export interface IsolatedProfile {
  profileId: string;
  directory: string;
}

/**
 * Copy the base profile's configuration into a new profile directory under the same Hermes home.
 * Hermes keeps sessions and memory inside the profile directory, so each run gets its own directory.
 * The dependency install stays on the shared home and is not copied.
 */
export async function createIsolatedProfile(
  hermesHome: string,
  sourceProfileId: string,
): Promise<IsolatedProfile> {
  assertProfileId(sourceProfileId);
  const source = path.join(hermesHome, 'profiles', sourceProfileId);
  // Nine characters stays inside the Hermes profile-list column. A longer id breaks parsing.
  const profileId = `e${randomBytes(4).toString('hex')}`;
  const directory = path.join(hermesHome, 'profiles', profileId);
  await mkdir(directory, { recursive: true });
  try {
    let copiedConfig = false;
    for (const name of PROFILE_COPY_FILES) {
      try {
        await copyFile(path.join(source, name), path.join(directory, name));
        if (name === 'config.yaml') {
          copiedConfig = true;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
    if (!copiedConfig) {
      throw new Error(
        `Hermes profile ${sourceProfileId} is not in the project Hermes home. Run npm run dev so setup can create it.`,
      );
    }
    try {
      await cp(path.join(source, 'skills'), path.join(directory, 'skills'), { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    try {
      await chmod(path.join(directory, '.env'), 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { profileId, directory };
}

/** Remove a run profile from Hermes's registry. `rm` alone leaves it visible to `profile list`. */
export async function deleteIsolatedProfile(options: {
  executable: string;
  hermesHome: string;
  profileId: string;
  spawnImpl?: SpawnImpl;
}): Promise<void> {
  assertProfileId(options.profileId);
  if (options.profileId === 'eval-base' || options.profileId === 'default') {
    throw new Error(`Refusing to delete the ${options.profileId} Hermes profile.`);
  }
  const spawnImpl = options.spawnImpl ?? spawn;
  const child = spawnImpl(options.executable, ['profile', 'delete', options.profileId, '-y'], {
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, HERMES_HOME: options.hermesHome },
  });
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 20_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve();
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
