import { Request, Response, NextFunction } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare global {
  namespace Express {
    interface Request {
      sessionId: string;
    }
  }
}

export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerVal = req.headers['x-session-id'];
  const queryVal = req.query.sessionId;
  const id = (typeof headerVal === 'string' ? headerVal : null)
           ?? (typeof queryVal === 'string' ? queryVal : null);

  if (!id || !UUID_RE.test(id)) {
    res.status(400).json({ error: 'Missing or invalid session ID (X-Session-ID header or sessionId query param)' });
    return;
  }
  req.sessionId = id;
  next();
}
