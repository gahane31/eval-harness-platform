import type { RuntimeSkill } from '@eval/shared';
import { SKILL_CONFIGURATION_LIMITATION } from './hermes.constants';
import { HermesOutputError } from './parse-profiles';

const SKILL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FOOTER_PATTERN =
  /^(\d+) hub-installed, (\d+) builtin, (\d+) local — (?:(\d+) enabled, (\d+) disabled|(\d+) enabled shown)$/;

export function parseSkillsList(output: string): RuntimeSkill[] {
  const lines = output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const headerIndex = lines.findIndex((line) => line.includes('Name') && line.includes('Status'));
  const footer = lines.find((line) => FOOTER_PATTERN.test(line.trim()));
  if (headerIndex < 0 || !footer) {
    throw new HermesOutputError('Hermes skills list was not in the expected format.');
  }

  const footerMatch = FOOTER_PATTERN.exec(footer.trim());
  if (!footerMatch) {
    throw new HermesOutputError('Hermes skills list was not in the expected format.');
  }

  const headerCells = splitRow(lines[headerIndex] ?? '');
  if (
    !headerCells ||
    headerCells[0] !== 'Name' ||
    headerCells[1] !== 'Category' ||
    headerCells[2] !== 'Source' ||
    headerCells[3] !== 'Trust' ||
    headerCells[4] !== 'Status'
  ) {
    throw new HermesOutputError('Hermes skills list columns were not in the expected order.');
  }

  const skills: RuntimeSkill[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === footer.trim()) {
      break;
    }
    const cells = splitRow(line);
    if (!cells) {
      continue;
    }
    if (cells.length !== 5) {
      throw new HermesOutputError('Hermes skills list contained a row with an unexpected shape.');
    }
    const [name, , source, , status] = cells;
    if (!name || !source || !status || name.includes('…') || name.endsWith('...')) {
      throw new HermesOutputError(
        'Hermes skills list truncated a skill name. Discovery was rejected instead of using a partial identifier.',
      );
    }
    if (!SKILL_ID_PATTERN.test(name) || (status !== 'enabled' && status !== 'disabled')) {
      throw new HermesOutputError('Hermes skills list contained an unrecognized skill row.');
    }
    skills.push({
      id: name,
      name,
      source,
      installed: true,
      enabled: status === 'enabled',
      configurable: false,
      limitation: SKILL_CONFIGURATION_LIMITATION,
    });
  }

  const expectedCount = Number(footerMatch[1]) + Number(footerMatch[2]) + Number(footerMatch[3]);
  if (skills.length !== expectedCount) {
    throw new HermesOutputError(
      'Hermes skills list count did not match the rows that were parsed.',
    );
  }

  return skills;
}

function splitRow(line: string): string[] | null {
  const trimmed = line.trim();
  const opener = trimmed[0];
  const closer = trimmed.at(-1);
  if ((opener !== '│' && opener !== '┃') || (closer !== '│' && closer !== '┃')) {
    return null;
  }
  return trimmed
    .slice(1, -1)
    .split(/[│┃]/)
    .map((cell) => cell.trim());
}
