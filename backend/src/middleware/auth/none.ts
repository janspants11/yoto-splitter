import { RequestHandler } from 'express';
export const noneMiddleware = (): RequestHandler => (_req, _res, next) => next();
