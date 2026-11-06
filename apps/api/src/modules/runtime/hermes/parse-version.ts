import { SUPPORTED_HERMES_VERSION } from './hermes.constants';

const VERSION_PATTERN = /^Hermes Agent v(\d+\.\d+\.\d+)\b/m;

export interface HermesVersionInfo {
  version: string;
  supported: boolean;
  message?: string;
}

export function parseHermesVersion(output: string): HermesVersionInfo {
  const match = VERSION_PATTERN.exec(output.trim());
  if (!match) {
    return {
      version: '',
      supported: false,
      message: 'Hermes version output was not in the expected format.',
    };
  }

  const version = match[1] ?? '';
  if (version !== SUPPORTED_HERMES_VERSION) {
    return {
      version,
      supported: false,
      message: `Hermes ${version} is installed. This application parses discovery output from Hermes ${SUPPORTED_HERMES_VERSION} only.`,
    };
  }

  return { version, supported: true };
}
