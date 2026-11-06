import { jsonValueSchema, type JsonValue } from '@eval/shared';

export interface JsonExtractionSuccess {
  ok: true;
  value: JsonValue;
}

export interface JsonExtractionFailure {
  ok: false;
  error: string;
}

export type JsonExtraction = JsonExtractionSuccess | JsonExtractionFailure;

export function extractJsonObject(text: string): JsonExtraction {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'The response is empty.' };
  }
  const whole = parseJsonValue(trimmed);
  if (whole.ok) {
    if (isJsonObject(whole.value)) {
      return { ok: true, value: whole.value };
    }
    return { ok: false, error: 'The response JSON is not an object.' };
  }

  const earliest: { index: number; value: JsonValue | null } = { index: -1, value: null };
  const consider = (index: number, raw: string) => {
    const parsed = parseJsonValue(raw.trim());
    if (!parsed.ok || !isJsonObject(parsed.value)) {
      return;
    }
    if (earliest.value === null || index < earliest.index) {
      earliest.index = index;
      earliest.value = parsed.value;
    }
  };

  for (const fence of fencedBodies(text)) {
    consider(fence.index, fence.body);
  }
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') {
      continue;
    }
    const slice = readBalancedObject(text, index);
    if (slice !== null) {
      consider(index, slice);
    }
  }

  if (earliest.value === null) {
    return { ok: false, error: 'No JSON object was found in the response.' };
  }
  return { ok: true, value: earliest.value };
}

function parseJsonValue(text: string): { ok: true; value: JsonValue } | { ok: false } {
  try {
    const parsed: unknown = JSON.parse(text);
    const value = jsonValueSchema.safeParse(parsed);
    return value.success ? { ok: true, value: value.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fencedBodies(text: string): Array<{ index: number; body: string }> {
  const bodies: Array<{ index: number; body: string }> = [];
  let search = 0;
  while (search < text.length) {
    const start = text.indexOf('```', search);
    if (start < 0) {
      break;
    }
    const lineEnd = text.indexOf('\n', start + 3);
    const bodyStart = lineEnd < 0 ? start + 3 : lineEnd + 1;
    const end = text.indexOf('```', bodyStart);
    if (end < 0) {
      break;
    }
    bodies.push({ index: start, body: text.slice(bodyStart, end) });
    search = end + 3;
  }
  return bodies;
}

function readBalancedObject(text: string, start: number): string | null {
  if (text[start] !== '{') {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}
