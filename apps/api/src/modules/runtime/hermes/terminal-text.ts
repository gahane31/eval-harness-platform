const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const ANSI_PATTERN = new RegExp(
  `${ESC}(?:\\[[0-9;?]*[A-Za-z]|\\][^${BEL}]*(?:${BEL}|${ESC}\\\\))`,
  'g',
);

export function sanitizeTerminalText(value: string): string {
  const stripped = value.replace(ANSI_PATTERN, '').replace(/\r/g, '');
  let output = '';
  for (const character of stripped) {
    if (character === '\b') {
      output = output.slice(0, -1);
      continue;
    }
    if (character < ' ' && character !== '\n' && character !== '\t') {
      continue;
    }
    output += character;
  }
  return output;
}
