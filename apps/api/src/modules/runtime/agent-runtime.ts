import type {
  AgentDraftConfig,
  ConfigurationValidation,
  RuntimeCapabilities,
  RuntimeModelCatalogue,
  RuntimeProfileCatalogue,
  RuntimeSkillCatalogue,
  RuntimeToolsetCatalogue,
} from '@eval/shared';

export const AGENT_RUNTIME = Symbol('AGENT_RUNTIME');

export interface RuntimeScope {
  profile: string;
  refresh?: boolean;
}

export interface AgentRuntime {
  getCapabilities(scope: RuntimeScope): Promise<RuntimeCapabilities>;
  getModels(scope: RuntimeScope): Promise<RuntimeModelCatalogue>;
  getSkills(scope: RuntimeScope): Promise<RuntimeSkillCatalogue>;
  getToolsets(scope: RuntimeScope): Promise<RuntimeToolsetCatalogue>;
  getProfiles(options?: { refresh?: boolean }): Promise<RuntimeProfileCatalogue>;
  validateConfiguration(
    config: AgentDraftConfig,
    scope: RuntimeScope,
  ): Promise<ConfigurationValidation>;
}
