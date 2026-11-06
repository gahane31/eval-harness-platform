import type { JsonValue } from '@eval/shared';
import { extractJsonObject } from './extract-json';
import { validateJsonSchema } from './validate-json-schema';

export const STRUCTURED_OUTPUT_INSTRUCTIONS =
  'You must return your final response as a single valid JSON object conforming to the JSON Schema below. Do not include Markdown code fences, explanations, comments, or any additional text outside the JSON object. Do not invent missing information. Use null for fields where information is unavailable if the schema permits null.';

export interface StructuredOutputReport {
  extracted: JsonValue | null;
  parsed: boolean;
  parseError: string | null;
  schemaValid: boolean | null;
  validationErrors: string[];
}

export function buildTaskPrompt(input: string, outputSchema: JsonValue | null | undefined): string {
  if (outputSchema === null || outputSchema === undefined) {
    return input;
  }
  return `${STRUCTURED_OUTPUT_INSTRUCTIONS}\n\nJSON Schema:\n${JSON.stringify(outputSchema, null, 2)}\n\n${input}`;
}

export function inspectStructuredOutput(
  output: string | null,
  outputSchema: JsonValue | null | undefined,
): StructuredOutputReport | null {
  if (outputSchema === null || outputSchema === undefined) {
    return null;
  }
  if (output === null) {
    return {
      extracted: null,
      parsed: false,
      parseError: 'The run has no final output.',
      schemaValid: null,
      validationErrors: [],
    };
  }
  const extracted = extractJsonObject(output);
  if (!extracted.ok) {
    return {
      extracted: null,
      parsed: false,
      parseError: extracted.error,
      schemaValid: null,
      validationErrors: [],
    };
  }
  const validation = validateJsonSchema(extracted.value, outputSchema);
  return {
    extracted: extracted.value,
    parsed: true,
    parseError: null,
    schemaValid: validation.valid,
    validationErrors: validation.errors,
  };
}

export function structuredValueForEvaluation(
  report: StructuredOutputReport | null,
): JsonValue | undefined {
  if (report?.parsed && report.schemaValid === true && report.extracted !== null) {
    return report.extracted;
  }
  return undefined;
}
