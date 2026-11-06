import { extractJsonObject } from './extract-json';
import { validateJsonSchema } from './validate-json-schema';
import { buildTaskPrompt } from './structured-output';

const citySchema = {
  type: 'object',
  properties: { city: { type: 'string' } },
  required: ['city'],
  additionalProperties: false,
};

describe('extractJsonObject', () => {
  it('reads a pure JSON object', () => {
    expect(extractJsonObject('{"city":"Paris"}')).toEqual({
      ok: true,
      value: { city: 'Paris' },
    });
  });

  it('reads JSON inside a Markdown fence', () => {
    const text = 'Here is the result:\n\n```json\n{\n  "city": "Paris"\n}\n```\n';
    expect(extractJsonObject(text)).toEqual({ ok: true, value: { city: 'Paris' } });
  });

  it('reads JSON after explanatory text', () => {
    const text = 'Based on the landmark, the city is Paris.\n\n{"city":"Paris"}\n';
    expect(extractJsonObject(text)).toEqual({ ok: true, value: { city: 'Paris' } });
  });

  it('keeps nested objects and escaped quotes', () => {
    const text = '{"place":{"name":"Eiffel \\"Tower\\""},"city":"Paris"}';
    expect(extractJsonObject(text)).toEqual({
      ok: true,
      value: { place: { name: 'Eiffel "Tower"' }, city: 'Paris' },
    });
  });

  it('uses the first valid object when several are present', () => {
    expect(extractJsonObject('{"city":"Paris"} and then {"city":"Lyon"}')).toEqual({
      ok: true,
      value: { city: 'Paris' },
    });
  });

  it('rejects malformed JSON, missing JSON, and a non-object document', () => {
    expect(extractJsonObject('{ "city": ')).toMatchObject({ ok: false });
    expect(extractJsonObject('The city is Paris.')).toMatchObject({ ok: false });
    expect(extractJsonObject('["Paris"]')).toEqual({
      ok: false,
      error: 'The response JSON is not an object.',
    });
  });
});

describe('validateJsonSchema', () => {
  it('accepts JSON that matches the schema', () => {
    expect(validateJsonSchema({ city: 'Paris' }, citySchema)).toEqual({ valid: true, errors: [] });
  });

  it('reports JSON that does not match the schema', () => {
    const result = validateJsonSchema({ city: 1 }, citySchema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports a schema that cannot be used', () => {
    const result = validateJsonSchema({ city: 'Paris' }, { type: 'object', required: 'city' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('buildTaskPrompt', () => {
  it('leaves a task without a schema unchanged and does not include the expected outcome', () => {
    expect(buildTaskPrompt('What city is the Eiffel Tower in?', null)).toBe(
      'What city is the Eiffel Tower in?',
    );
  });

  it('appends the schema instructions while keeping the original input', () => {
    const prompt = buildTaskPrompt('What city is the Eiffel Tower in?', citySchema);
    expect(prompt).toContain('single valid JSON object');
    expect(prompt).toContain('"city"');
    expect(prompt.endsWith('What city is the Eiffel Tower in?')).toBe(true);
    expect(prompt).not.toContain('expectedOutcome');
  });
});
