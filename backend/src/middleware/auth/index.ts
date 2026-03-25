import { RequestHandler } from 'express';
import { noneMiddleware } from './none';
import { basicMiddleware } from './basic';

export function authMiddleware(): RequestHandler {
  const mode = process.env.AUTH_MODE ?? 'none';
  switch (mode) {
    case 'basic': return basicMiddleware();
    default: return noneMiddleware();
  }
}
