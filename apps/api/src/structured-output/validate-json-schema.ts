import Ajv, { type ErrorObject } from 'ajv';

export interface SchemaValidation {
  valid: boolean;
  errors: string[];
}

export function validateJsonSchema(value: unknown, schema: unknown): SchemaValidation {
  try {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema as object);
    if (validate(value) === true) {
      return { valid: true, errors: [] };
    }
    return { valid: false, errors: (validate.errors ?? []).map(formatError) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The output schema could not be used.';
    return { valid: false, errors: [message] };
  }
}

function formatError(error: ErrorObject): string {
  const path = error.instancePath.length > 0 ? error.instancePath : '/';
  return `${path} ${error.message ?? 'is invalid'}`;
}
