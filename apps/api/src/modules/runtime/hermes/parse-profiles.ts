const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class HermesOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HermesOutputError';
  }
}

export function parseProfileLabel(label: string): { id: string; name: string } {
  const trimmed = label.trim();
  const wrapped = /^(.*) \(([A-Za-z0-9][A-Za-z0-9_-]{0,63})\)$/.exec(trimmed);
  if (wrapped?.[2]) {
    return { id: wrapped[2], name: wrapped[1]?.trim() || wrapped[2] };
  }
  if (!PROFILE_ID_PATTERN.test(trimmed)) {
    throw new HermesOutputError('Hermes profile list contained an unrecognized profile name.');
  }
  return { id: trimmed, name: trimmed };
}

export function parseActiveProfile(output: string): string {
  const line = output
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('Active profile:'));
  if (!line) {
    throw new HermesOutputError('Hermes profile status was not in the expected format.');
  }
  return parseProfileLabel(line.slice('Active profile:'.length)).id;
}

export function parseProfileList(
  output: string,
): Array<{ id: string; name: string; status: string }> {
  const lines = output.split('\n');
  const headerIndex = lines.findIndex(
    (line) => line.includes('Profile') && line.includes('Gateway'),
  );
  if (headerIndex < 0) {
    throw new HermesOutputError('Hermes profile list was not in the expected format.');
  }

  const profiles: Array<{ id: string; name: string; status: string }> = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim() || line.includes('─')) {
      continue;
    }
    const match = /^(?: ◆| {2})(\S.*?)\s{2,}(\S.*?)\s{2,}(running|stopped)\s{2,}/.exec(line);
    if (!match?.[1] || !match[3]) {
      if (line.trim()) {
        throw new HermesOutputError('Hermes profile list contained an unrecognized row.');
      }
      continue;
    }
    const label = parseProfileLabel(match[1]);
    profiles.push({ id: label.id, name: label.name, status: match[3] });
  }

  if (profiles.length === 0) {
    throw new HermesOutputError('Hermes profile list did not include any profiles.');
  }

  return profiles;
}
