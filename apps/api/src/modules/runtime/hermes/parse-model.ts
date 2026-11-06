import type { RuntimeModelProvider } from '@eval/shared';
import { MODEL_AVAILABILITY_LIMITATION } from './hermes.constants';
import { HermesOutputError } from './parse-profiles';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function parseModelConfig(output: string): RuntimeModelProvider[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new HermesOutputError('Hermes model configuration was not JSON.');
  }

  if (!isRecord(parsed)) {
    throw new HermesOutputError('Hermes model configuration was not in the expected format.');
  }

  const model = parsed.default;
  const provider = parsed.provider;
  if (typeof model !== 'string' || typeof provider !== 'string') {
    throw new HermesOutputError('Hermes model configuration did not include a provider and model.');
  }
  if (!IDENTIFIER_PATTERN.test(model) || !IDENTIFIER_PATTERN.test(provider)) {
    throw new HermesOutputError('Hermes model configuration contained an unrecognized identifier.');
  }

  return [
    {
      provider,
      models: [
        {
          id: model,
          name: model,
          availability: 'unknown',
          limitation: MODEL_AVAILABILITY_LIMITATION,
        },
      ],
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
