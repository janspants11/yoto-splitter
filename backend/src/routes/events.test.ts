import request from 'supertest';
import { buildApp } from '../index';
import { initDb, createJob, updateJob } from '../db';
import { JobQueue } from '../queue/job-queue';
import type Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SESSION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const OTHER_SESSION = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

let db: Database.Database;
let queue: JobQueue;
let worker: EventEmitter;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoto-events-test-'));
  process.env.DATA_DIR = tmpDir;
  db = initDb(':memory:');
  queue = new JobQueue();
  worker = new EventEmitter();
  (worker as unknown as { cancelCurrent: () => boolean }).cancelCurrent = jest.fn(() => true);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function app() {
  return buildApp({ db, queue, worker: worker as any });  // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('GET /api/events/:id', () => {
  it('returns 404 for unknown job', async () => {
    const res = await request(app()).get('/api/events/nonexistent').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
  });

  it('returns SSE headers for a complete job', async () => {
    createJob(db, { id: 'e1', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'e1', { status: 'complete' });

    const res = await request(app()).get('/api/events/e1').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');

    // Should contain a named complete event
    expect(res.text).toContain('event: complete');
  });

  it('returns 404 for complete job owned by different session', async () => {
    createJob(db, { id: 'e2', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: OTHER_SESSION });
    updateJob(db, 'e2', { status: 'complete' });

    const res = await request(app()).get('/api/events/e2').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
  });
});
