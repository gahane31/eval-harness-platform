import { Prisma } from '../generated/prisma/client';

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  if (value === null) {
    return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  }

  const serialized: unknown = JSON.parse(JSON.stringify(value));
  if (
    typeof serialized === 'string' ||
    typeof serialized === 'number' ||
    typeof serialized === 'boolean' ||
    Array.isArray(serialized) ||
    (typeof serialized === 'object' && serialized !== null)
  ) {
    return serialized as Prisma.InputJsonValue;
  }

  throw new Error('Value cannot be stored as JSON.');
}
