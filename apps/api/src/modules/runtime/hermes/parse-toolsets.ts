import type { RuntimeToolset } from '@eval/shared';
import { TOOLSET_CONFIGURATION_LIMITATION } from './hermes.constants';
import { HermesOutputError } from './parse-profiles';

const TOOLSET_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const ROW_PATTERN = /^ {2}([✓✗]) (enabled|disabled) {2}([a-z][a-z0-9_]*) {2}(.+)$/;

export function parseToolsetsList(output: string): RuntimeToolset[] {
  if (!output.includes('Built-in toolsets (cli):')) {
    throw new HermesOutputError('Hermes tools list was not in the expected format.');
  }

  const toolsets: RuntimeToolset[] = [];
  for (const line of output.split('\n')) {
    const match = ROW_PATTERN.exec(line);
    if (!match?.[2] || !match[3] || !match[4]) {
      if (line.trim() && !isToolsetChrome(line)) {
        throw new HermesOutputError('Hermes tools list contained an unrecognized row.');
      }
      continue;
    }
    if (!TOOLSET_ID_PATTERN.test(match[3])) {
      throw new HermesOutputError('Hermes tools list contained an unrecognized toolset id.');
    }
    toolsets.push({
      id: match[3],
      name: displayName(match[4]),
      available: true,
      enabled: match[2] === 'enabled',
      configurable: false,
      limitation: TOOLSET_CONFIGURATION_LIMITATION,
    });
  }

  if (toolsets.length === 0) {
    throw new HermesOutputError('Hermes tools list did not include any toolsets.');
  }

  return toolsets;
}

function isToolsetChrome(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('Built-in toolsets') ||
    trimmed.startsWith('Plugin toolsets') ||
    trimmed.startsWith('MCP servers:')
  );
}

function displayName(label: string): string {
  const parts = label.trim().split(/\s+/);
  const first = parts[0] ?? '';
  if (parts.length > 1 && !/[A-Za-z0-9]/.test(first)) {
    return parts.slice(1).join(' ');
  }
  return label.trim();
}
