import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: ContentfulStatusCode, message: string) {
    super(message);
  }
}

export function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return c.json({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input' }, 400);
  }
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (/UNIQUE constraint failed/.test(err.message)) {
    return c.json({ error: 'A record with that value already exists' }, 409);
  }
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
};
