import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AgentDraftConfig,
  ConfigurationValidation,
  RuntimeCapabilities,
  RuntimeDiscoveryError,
  RuntimeDiscoveryErrorCode,
  RuntimeModelCatalogue,
  RuntimeProfileCatalogue,
  RuntimeSkillCatalogue,
  RuntimeToolsetCatalogue,
} from '@eval/shared';
import { HERMES_DISCOVERY_TTL_MS } from './hermes.constants';
import { HERMES_COMMANDS, HermesLaunchError, type HermesCommandRunner } from './hermes-command';
import { HermesOutputError } from './parse-profiles';
import { parseModelConfig } from './parse-model';
import { parseActiveProfile, parseProfileList } from './parse-profiles';
import { parseSkillsList } from './parse-skills';
import { parseToolsetsList } from './parse-toolsets';
import { parseHermesVersion } from './parse-version';
import type { AgentRuntime, RuntimeScope } from '../agent-runtime';
import { validateAgentDraft } from '../validate-draft';

interface DiagnosticEvent {
  capability: string;
  code: RuntimeDiscoveryErrorCode;
  exitCode?: number;
  profile?: string;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

@Injectable()
export class HermesRuntime implements AgentRuntime {
  private readonly logger = new Logger(HermesRuntime.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  clock: () => number = Date.now;
  diagnostics: (event: DiagnosticEvent) => void = (event) => {
    this.logger.warn(JSON.stringify(event));
  };

  constructor(@Inject(HERMES_COMMANDS) private readonly commands: HermesCommandRunner) {}

  getCapabilities(scope: RuntimeScope): Promise<RuntimeCapabilities> {
    return this.remember(`capabilities:${scope.profile}`, scope.refresh === true, async () => {
      const discoveredAt = new Date(this.clock()).toISOString();
      const version = await this.readVersion(scope.refresh === true);
      if (!version.supported) {
        return {
          runtime: 'hermes' as const,
          version: version.version,
          available: false,
          discoveredAt,
          cached: false,
          profile: scope.profile,
          discoveryErrors: version.errors,
        };
      }

      const [skills, toolsets, models] = await Promise.all([
        this.getSkills(scope),
        this.getToolsets(scope),
        this.getModels(scope),
      ]);
      return {
        runtime: 'hermes' as const,
        version: version.version,
        available: true,
        discoveredAt,
        cached: false,
        profile: scope.profile,
        discoveryErrors: [
          ...skills.discoveryErrors,
          ...toolsets.discoveryErrors,
          ...models.discoveryErrors,
        ],
      };
    });
  }

  getProfiles(options?: { refresh?: boolean }): Promise<RuntimeProfileCatalogue> {
    return this.remember('profiles', options?.refresh === true, () => this.loadProfiles());
  }

  getSkills(scope: RuntimeScope): Promise<RuntimeSkillCatalogue> {
    return this.remember(`skills:${scope.profile}`, scope.refresh === true, () =>
      this.loadSkills(scope.profile),
    );
  }

  getToolsets(scope: RuntimeScope): Promise<RuntimeToolsetCatalogue> {
    return this.remember(`toolsets:${scope.profile}`, scope.refresh === true, () =>
      this.loadToolsets(scope.profile),
    );
  }

  getModels(scope: RuntimeScope): Promise<RuntimeModelCatalogue> {
    return this.remember(`models:${scope.profile}`, scope.refresh === true, () =>
      this.loadModels(scope.profile),
    );
  }

  async validateConfiguration(
    config: AgentDraftConfig,
    scope: RuntimeScope,
  ): Promise<ConfigurationValidation> {
    const [skills, toolsets, models] = await Promise.all([
      this.getSkills(scope),
      this.getToolsets(scope),
      this.getModels(scope),
    ]);
    return validateAgentDraft(config, {
      providers: models.providers,
      skills: skills.skills,
      toolsets: toolsets.toolsets,
      modelsFailed: models.discoveryErrors.length > 0,
      skillsFailed: skills.discoveryErrors.length > 0,
      toolsetsFailed: toolsets.discoveryErrors.length > 0,
    });
  }

  private async loadProfiles(): Promise<RuntimeProfileCatalogue> {
    const discoveredAt = new Date(this.clock()).toISOString();
    const version = await this.readVersion(false);
    if (!version.supported) {
      return {
        profiles: [],
        discoveryErrors: version.errors.map((error) => ({ ...error, capability: 'profiles' })),
        cached: false,
        discoveredAt,
      };
    }

    const listed = await this.capture('profiles', ['profile', 'list']);
    if ('error' in listed) {
      return { profiles: [], discoveryErrors: [listed.error], cached: false, discoveredAt };
    }

    let rows: ReturnType<typeof parseProfileList>;
    try {
      rows = parseProfileList(listed.stdout);
    } catch (error) {
      return {
        profiles: [],
        discoveryErrors: [this.outputError('profiles', error)],
        cached: false,
        discoveredAt,
      };
    }

    const active = await this.capture('profiles', ['profile']);
    let activeProfile: string | undefined;
    const errors: RuntimeDiscoveryError[] = [];
    if ('error' in active) {
      errors.push(active.error);
    } else {
      try {
        activeProfile = parseActiveProfile(active.stdout);
      } catch (error) {
        errors.push(this.outputError('profiles', error));
      }
    }

    const profiles = rows.map((row) => ({
      id: row.id,
      name: row.name,
      isDefault: row.id === 'default',
      status: row.status,
    }));

    return {
      profiles,
      ...(activeProfile ? { activeProfile } : {}),
      discoveryErrors: errors,
      cached: false,
      discoveredAt,
    };
  }

  private loadSkills(profile: string): Promise<RuntimeSkillCatalogue> {
    return this.loadScoped(profile, 'skills', ['-p', profile, 'skills', 'list'], (stdout) => ({
      skills: parseSkillsList(stdout),
    })) as Promise<RuntimeSkillCatalogue>;
  }

  private loadToolsets(profile: string): Promise<RuntimeToolsetCatalogue> {
    return this.loadScoped(profile, 'toolsets', ['-p', profile, 'tools', 'list'], (stdout) => ({
      toolsets: parseToolsetsList(stdout),
    })) as Promise<RuntimeToolsetCatalogue>;
  }

  private loadModels(profile: string): Promise<RuntimeModelCatalogue> {
    return this.loadScoped(
      profile,
      'models',
      ['-p', profile, 'config', 'get', 'model', '--json'],
      (stdout) => ({ providers: parseModelConfig(stdout) }),
    ) as Promise<RuntimeModelCatalogue>;
  }

  private async loadScoped(
    profile: string,
    capability: 'skills' | 'toolsets' | 'models',
    args: readonly string[],
    parse: (stdout: string) => Record<string, unknown>,
  ): Promise<{
    profile: string;
    discoveryErrors: RuntimeDiscoveryError[];
    cached: boolean;
    discoveredAt: string;
  }> {
    const discoveredAt = new Date(this.clock()).toISOString();
    const blank = {
      ...emptyCatalogue(capability),
      profile,
      discoveryErrors: [] as RuntimeDiscoveryError[],
      cached: false,
      discoveredAt,
    };
    const gate = await this.ensureProfile(profile, capability);
    if (gate) {
      return { ...blank, discoveryErrors: [gate] };
    }

    const captured = await this.capture(capability, args, profile);
    if ('error' in captured) {
      return { ...blank, discoveryErrors: [captured.error] };
    }

    try {
      return { ...blank, ...parse(captured.stdout), discoveryErrors: [] };
    } catch (error) {
      return { ...blank, discoveryErrors: [this.outputError(capability, error)] };
    }
  }

  private async ensureProfile(
    profile: string,
    capability: string,
  ): Promise<RuntimeDiscoveryError | undefined> {
    const version = await this.readVersion(false);
    if (!version.supported) {
      const existing = version.errors[0];
      return {
        capability,
        code: existing?.code ?? 'UNSUPPORTED_VERSION',
        message: existing?.message ?? 'The installed Hermes version is not supported.',
        ...(existing?.exitCode !== undefined ? { exitCode: existing.exitCode } : {}),
      };
    }
    const profiles = await this.getProfiles();
    if (profiles.profiles.some((item) => item.id === profile)) {
      return undefined;
    }
    if (profiles.discoveryErrors.length > 0) {
      return {
        capability,
        code: profiles.discoveryErrors[0]?.code ?? 'COMMAND_FAILED',
        message: 'Hermes profiles could not be listed, so this profile was not inspected.',
        ...(profiles.discoveryErrors[0]?.exitCode !== undefined
          ? { exitCode: profiles.discoveryErrors[0].exitCode }
          : {}),
      };
    }
    return {
      capability,
      code: 'PROFILE_NOT_FOUND',
      message: `Hermes profile ${profile} was not found.`,
    };
  }

  private async readVersion(refresh: boolean): Promise<{
    version: string;
    supported: boolean;
    cached: boolean;
    errors: RuntimeDiscoveryError[];
  }> {
    return this.remember('version', refresh, async () => {
      const captured = await this.capture('version', ['--version']);
      if ('error' in captured) {
        return { version: '', supported: false, cached: false, errors: [captured.error] };
      }
      const parsed = parseHermesVersion(captured.stdout);
      if (!parsed.supported) {
        const code: RuntimeDiscoveryErrorCode = parsed.version
          ? 'UNSUPPORTED_VERSION'
          : 'UNSUPPORTED_OUTPUT';
        this.diagnostics({ capability: 'version', code });
        return {
          version: parsed.version,
          supported: false,
          cached: false,
          errors: [
            {
              capability: 'version',
              code,
              message: parsed.message ?? 'Hermes version output was not recognized.',
            },
          ],
        };
      }
      return { version: parsed.version, supported: true, cached: false, errors: [] };
    });
  }

  private async capture(
    capability: string,
    args: readonly string[],
    profile?: string,
  ): Promise<{ stdout: string } | { error: RuntimeDiscoveryError }> {
    try {
      const result = await this.commands.run(args);
      if (result.launchFailed) {
        return { error: this.fail(capability, 'EXECUTABLE_NOT_FOUND', profile) };
      }
      if (result.timedOut) {
        return { error: this.fail(capability, 'TIMEOUT', profile) };
      }
      if (result.outputLimitExceeded) {
        return { error: this.fail(capability, 'OUTPUT_LIMIT', profile) };
      }
      if (result.exitCode !== 0) {
        return {
          error: this.fail(capability, 'COMMAND_FAILED', profile, result.exitCode ?? undefined),
        };
      }
      return { stdout: result.stdout };
    } catch (error) {
      const code = error instanceof HermesLaunchError ? error.code : 'COMMAND_FAILED';
      return { error: this.fail(capability, code, profile) };
    }
  }

  private fail(
    capability: string,
    code: RuntimeDiscoveryErrorCode,
    profile?: string,
    exitCode?: number,
  ): RuntimeDiscoveryError {
    this.diagnostics({
      capability,
      code,
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(profile ? { profile } : {}),
    });
    return {
      capability,
      code,
      message: failureMessage(capability, code),
      ...(exitCode !== undefined ? { exitCode } : {}),
    };
  }

  private outputError(capability: string, error: unknown): RuntimeDiscoveryError {
    this.diagnostics({ capability, code: 'UNSUPPORTED_OUTPUT' });
    const message =
      error instanceof HermesOutputError
        ? error.message
        : 'Hermes output was not in the expected format.';
    return { capability, code: 'UNSUPPORTED_OUTPUT', message };
  }

  private async remember<T extends { cached: boolean }>(
    key: string,
    refresh: boolean,
    load: () => Promise<T>,
  ): Promise<T> {
    if (refresh) {
      this.cache.delete(key);
    } else {
      const hit = this.cache.get(key);
      if (hit && hit.expiresAt > this.clock()) {
        return { ...(hit.value as T), cached: true };
      }
    }

    if (!refresh) {
      const pending = this.inflight.get(key);
      if (pending) {
        return pending as Promise<T>;
      }
    }

    const promise = load()
      .then((value) => {
        this.cache.set(key, { value, expiresAt: this.clock() + HERMES_DISCOVERY_TTL_MS });
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }
}

function failureMessage(capability: string, code: RuntimeDiscoveryErrorCode): string {
  const subject = capabilityLabel(capability);
  switch (code) {
    case 'EXECUTABLE_NOT_FOUND':
      return 'The Hermes executable was not found.';
    case 'TIMEOUT':
      return `${subject} timed out.`;
    case 'OUTPUT_LIMIT':
      return `${subject} output was too large to read.`;
    case 'UNSUPPORTED_VERSION':
      return 'The installed Hermes version is not supported.';
    case 'UNSUPPORTED_OUTPUT':
      return `${subject} output was not in the expected format.`;
    case 'PROFILE_NOT_FOUND':
      return 'The Hermes profile was not found.';
    case 'COMMAND_FAILED':
      return `${subject} failed.`;
    default:
      return `${subject} failed.`;
  }
}

function capabilityLabel(capability: string): string {
  switch (capability) {
    case 'skills':
      return 'Hermes skill discovery';
    case 'toolsets':
      return 'Hermes toolset discovery';
    case 'models':
      return 'Hermes model discovery';
    case 'profiles':
      return 'Hermes profile discovery';
    case 'version':
      return 'Hermes version discovery';
    default:
      return 'Hermes discovery';
  }
}

function emptyCatalogue(capability: string): Record<string, unknown> {
  if (capability === 'skills') {
    return { skills: [] };
  }
  if (capability === 'toolsets') {
    return { toolsets: [] };
  }
  return { providers: [] };
}
