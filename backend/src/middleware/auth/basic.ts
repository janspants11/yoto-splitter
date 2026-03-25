import { RequestHandler } from 'express';
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const basicMiddleware = (): RequestHandler => {
  if (!process.env.BASIC_USER || !process.env.BASIC_PASS) {
    throw new Error('[auth] AUTH_MODE=basic requires BASIC_USER and BASIC_PASS env vars to be set');
  }
  const expectedUser = process.env.BASIC_USER;
  const expectedPass = process.env.BASIC_PASS;
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="yoto-splitter"');
      return res.status(401).json({ error: 'Authentication required' });
    }
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const [user, ...passParts] = decoded.split(':');
    const pass = passParts.join(':');
    if (safeCompare(user, expectedUser) && safeCompare(pass, expectedPass)) {
      return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="yoto-splitter"');
    return res.status(401).json({ error: 'Invalid credentials' });
  };
};
