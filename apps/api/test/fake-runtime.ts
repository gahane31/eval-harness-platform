import type { AgentDraftConfig, ConfigurationValidation } from '@eval/shared';
import type { AgentRuntime, RuntimeScope } from '../src/modules/runtime/agent-runtime';
import { validateAgentDraft } from '../src/modules/runtime/validate-draft';

const discoveredAt = '2026-11-04T00:00:00.000Z';

const configuredModel = {
  id: 'gpt-5.4-mini',
  name: 'gpt-5.4-mini',
  availability: 'unknown' as const,
  limitation: 'Availability is unknown. Usability was not verified.',
};

function catalogueFor(profile: string) {
  if (profile === 'eval-base') {
    return {
      providers: [{ provider: 'openai-api', models: [configuredModel] }],
      skills: [
        {
          id: 'hermes-agent',
          name: 'hermes-agent',
          source: 'builtin',
          installed: true,
          enabled: true,
          configurable: false,
          limitation: 'Not configurable.',
        },
      ],
      toolsets: [
        {
          id: 'memory',
          name: 'Memory',
          available: true,
          enabled: true,
          configurable: false,
          limitation: 'Not configurable.',
        },
      ],
      modelsFailed: false,
      skillsFailed: false,
      toolsetsFailed: false,
    };
  }

  return {
    providers: [{ provider: 'openai-api', models: [configuredModel] }],
    skills: [
      {
        id: 'summarize',
        name: 'summarize',
        source: 'builtin',
        installed: true,
        enabled: true,
        configurable: false,
        limitation: 'Not configurable.',
      },
      {
        id: 'outline',
        name: 'outline',
        source: 'builtin',
        installed: true,
        enabled: false,
        configurable: false,
        limitation: 'Not configurable.',
      },
    ],
    toolsets: [
      {
        id: 'web',
        name: 'Web',
        available: true,
        enabled: true,
        configurable: false,
        limitation: 'Not configurable.',
      },
    ],
    modelsFailed: false,
    skillsFailed: false,
    toolsetsFailed: false,
  };
}

export function createFakeRuntime(): AgentRuntime {
  return {
    async getCapabilities(scope: RuntimeScope) {
      return {
        runtime: 'hermes',
        version: '0.22.7',
        available: true,
        discoveredAt,
        cached: false,
        profile: scope.profile,
        discoveryErrors: [],
      };
    },
    async getModels(scope) {
      return {
        profile: scope.profile,
        providers: catalogueFor(scope.profile).providers,
        discoveryErrors: [],
        cached: false,
        discoveredAt,
      };
    },
    async getSkills(scope) {
      return {
        profile: scope.profile,
        skills: catalogueFor(scope.profile).skills,
        discoveryErrors: [],
        cached: false,
        discoveredAt,
      };
    },
    async getToolsets(scope) {
      return {
        profile: scope.profile,
        toolsets: catalogueFor(scope.profile).toolsets,
        discoveryErrors: [],
        cached: false,
        discoveredAt,
      };
    },
    async getProfiles() {
      return {
        profiles: [
          {
            id: 'default',
            name: 'default',
            isDefault: true,
            provider: 'openai-api',
            model: 'gpt-5.4-mini',
            status: 'stopped',
          },
          {
            id: 'eval-base',
            name: 'eval-base',
            isDefault: false,
            provider: 'openai-api',
            model: 'gpt-5.4-mini',
            status: 'stopped',
          },
        ],
        activeProfile: 'default',
        discoveryErrors: [],
        cached: false,
        discoveredAt,
      };
    },
    validateConfiguration(
      config: AgentDraftConfig,
      scope: RuntimeScope,
    ): Promise<ConfigurationValidation> {
      return Promise.resolve(validateAgentDraft(config, catalogueFor(scope.profile)));
    },
  };
}
