import type {
  AgentDraftConfig,
  ConfigurationIssue,
  ConfigurationValidation,
  RuntimeModelProvider,
  RuntimeSkill,
  RuntimeToolset,
} from '@eval/shared';
import {
  HERMES_REASONING_LEVELS,
  MEMORY_BEHAVIOR_LIMITATION,
  MODEL_AVAILABILITY_LIMITATION,
} from './hermes/hermes.constants';

export interface RuntimeCatalogue {
  providers: RuntimeModelProvider[];
  skills: RuntimeSkill[];
  toolsets: RuntimeToolset[];
  modelsFailed: boolean;
  skillsFailed: boolean;
  toolsetsFailed: boolean;
}

export function validateAgentDraft(
  config: AgentDraftConfig,
  catalogue: RuntimeCatalogue,
): ConfigurationValidation {
  const errors: ConfigurationIssue[] = [];
  const warnings: ConfigurationIssue[] = [];

  if (catalogue.modelsFailed) {
    errors.push({
      path: 'provider',
      code: 'DISCOVERY_FAILED',
      message: 'Provider and model support could not be checked for the selected Hermes profile.',
    });
  } else {
    const model = catalogue.providers
      .find((provider) => provider.provider === config.provider)
      ?.models.find((candidate) => candidate.id === config.model);
    if (!model) {
      errors.push({
        path: 'model',
        code: 'UNSUPPORTED_CAPABILITY',
        message: 'The provider and model are not configured for the selected Hermes profile.',
      });
    } else if (model.availability === 'unavailable') {
      errors.push({
        path: 'model',
        code: 'UNSUPPORTED_CAPABILITY',
        message: model.limitation ?? 'The model is unavailable for the selected Hermes profile.',
      });
    } else if (model.availability === 'unknown') {
      warnings.push({
        path: 'model',
        code: 'UNVERIFIED_BEHAVIOR',
        message: model.limitation ?? MODEL_AVAILABILITY_LIMITATION,
      });
    }
  }

  if (config.reasoning !== undefined) {
    const accepted = HERMES_REASONING_LEVELS.some((level) => level === config.reasoning);
    if (!accepted) {
      errors.push({
        path: 'reasoning',
        code: 'UNSUPPORTED_CAPABILITY',
        message: 'Hermes does not accept this reasoning level.',
      });
    } else {
      warnings.push({
        path: 'reasoning',
        code: 'UNVERIFIED_BEHAVIOR',
        message:
          'This reasoning level is accepted by the Hermes CLI. Support for the selected model was not verified.',
      });
    }
  }

  if (catalogue.skillsFailed && config.skills.length > 0) {
    errors.push({
      path: 'skills',
      code: 'DISCOVERY_FAILED',
      message: 'Installed skills could not be checked for the selected Hermes profile.',
    });
  } else if (!catalogue.skillsFailed) {
    for (const skillId of config.skills) {
      const skill = catalogue.skills.find((candidate) => candidate.id === skillId);
      if (!skill?.installed) {
        errors.push({
          path: 'skills',
          code: 'UNSUPPORTED_CAPABILITY',
          message: `Skill ${skillId} is not installed in the selected Hermes profile.`,
        });
        continue;
      }
      if (!skill.configurable) {
        errors.push({
          path: 'skills',
          code: 'UNSUPPORTED_CAPABILITY',
          message: skill.limitation ?? `Skill ${skillId} cannot be configured by this runtime.`,
        });
      }
    }
  }

  if (catalogue.toolsetsFailed && config.toolsets.length > 0) {
    errors.push({
      path: 'toolsets',
      code: 'DISCOVERY_FAILED',
      message: 'Toolsets could not be checked for the selected Hermes profile.',
    });
  } else if (!catalogue.toolsetsFailed) {
    for (const toolsetId of config.toolsets) {
      const toolset = catalogue.toolsets.find((candidate) => candidate.id === toolsetId);
      if (!toolset?.available) {
        errors.push({
          path: 'toolsets',
          code: 'UNSUPPORTED_CAPABILITY',
          message: `Toolset ${toolsetId} is not available in the selected Hermes profile.`,
        });
        continue;
      }
      if (!toolset.configurable) {
        errors.push({
          path: 'toolsets',
          code: 'UNSUPPORTED_CAPABILITY',
          message:
            toolset.limitation ?? `Toolset ${toolsetId} cannot be configured by this runtime.`,
        });
      }
    }
  }

  warnings.push({
    path: 'memory.enabled',
    code: 'UNVERIFIED_BEHAVIOR',
    message: MEMORY_BEHAVIOR_LIMITATION,
  });

  return { valid: errors.length === 0, errors, warnings };
}
