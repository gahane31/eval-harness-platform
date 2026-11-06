/** Hermes Agent release whose command output this adapter parses. */
export const SUPPORTED_HERMES_VERSION = '0.22.7';

/** Avoid spawning Hermes again for every UI request. `refresh=true` bypasses this. */
export const HERMES_DISCOVERY_TTL_MS = 30_000;

export const HERMES_COMMAND_TIMEOUT_MS = 20_000;
export const HERMES_MAX_OUTPUT_BYTES = 1_000_000;
/** Rich truncates skill names when stdout is a narrow pipe. 500 columns keeps the verified names intact. */
export const HERMES_CAPTURE_COLUMNS = 500;

/**
 * Levels accepted by `hermes --reasoning` in the verified CLI help.
 * They are not evidence that a particular model supports them.
 */
export const HERMES_REASONING_LEVELS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;

export const SKILL_CONFIGURATION_LIMITATION =
  'Hermes can list this installed skill. Changing which skills are enabled would write the Hermes profile, and session preload was not verified as an exclusive selection. This application does not change profile skills.';

export const TOOLSET_CONFIGURATION_LIMITATION =
  'Hermes can list this toolset. The -t invocation flag is not a verified strict allowlist, and hermes tools enable or disable would write the profile. This application does not change profile toolsets.';

export const MODEL_AVAILABILITY_LIMITATION =
  'Availability is unknown. This model is configured for the Hermes profile, and usability was not verified because that requires a model invocation.';

export const MEMORY_BEHAVIOR_LIMITATION =
  'Memory enablement is stored on the draft only. Hermes memory and session persistence were not verified, including whether the memory toolset controls them.';
