import { ApiError } from '../api/client';

export function errorMessage(caught: unknown, fallback: string): string {
  if (!(caught instanceof ApiError)) {
    return fallback;
  }
  const message = evalWording(caught.message);
  if (caught.details.length === 0) {
    return message;
  }
  const details = caught.details.map((detail) => `${detail.path}: ${detail.message}`).join(' ');
  return `${message} ${evalWording(details)}`;
}

function evalWording(text: string): string {
  return text.replace(/\b([Ee])xperiment/g, (_match, first: string) =>
    first === 'E' ? 'Eval' : 'eval',
  );
}
