import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
export const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.header(REQUEST_ID_HEADER);
  const requestId = header && REQUEST_ID_PATTERN.test(header) ? header : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
