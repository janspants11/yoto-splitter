import express from 'express';
import request from 'supertest';
import { sessionMiddleware } from './session';

function makeApp() {
  const app = express();
  app.use(sessionMiddleware);
  app.get('/test', (req: any, res: any) => res.json({ sessionId: req.sessionId }));
  return app;
}

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('sessionMiddleware', () => {
  it('rejects requests with no session', async () => {
    const res = await request(makeApp()).get('/test');
    expect(res.status).toBe(400);
  });

  it('rejects invalid UUID in header', async () => {
    const res = await request(makeApp()).get('/test').set('X-Session-ID', 'not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('accepts valid UUID in header', async () => {
    const res = await request(makeApp()).get('/test').set('X-Session-ID', VALID_UUID);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(VALID_UUID);
  });

  it('accepts valid UUID in query param (EventSource fallback)', async () => {
    const res = await request(makeApp()).get(`/test?sessionId=${VALID_UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(VALID_UUID);
  });

  it('header takes precedence over query param', async () => {
    const otherId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const res = await request(makeApp())
      .get(`/test?sessionId=${otherId}`)
      .set('X-Session-ID', VALID_UUID);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(VALID_UUID);
  });
});
