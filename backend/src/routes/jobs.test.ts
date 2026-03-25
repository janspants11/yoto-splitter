import request from 'supertest';
import { buildApp } from '../index';
import { initDb, createJob, getJob, updateJob } from '../db';
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
let worker: EventEmitter & { cancelCurrent: () => boolean };
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoto-jobs-test-'));
  process.env.DATA_DIR = tmpDir;
  db = initDb(':memory:');
  queue = new JobQueue();
  // Create a mock worker (extends EventEmitter, has cancelCurrent)
  const w = new EventEmitter();
  (w as unknown as { cancelCurrent: () => boolean }).cancelCurrent = jest.fn(() => true);
  worker = w as EventEmitter & { cancelCurrent: () => boolean };
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function app() {
  return buildApp({ db, queue, worker: worker as any });  // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('GET /api/jobs', () => {
  it('returns [] when empty', async () => {
    const res = await request(app()).get('/api/jobs').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns jobs after creation', async () => {
    createJob(db, { id: 'j1', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    const res = await request(app()).get('/api/jobs').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('j1');
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await request(app()).get('/api/jobs/nonexistent').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
  });

  it('returns job when found', async () => {
    createJob(db, { id: 'j2', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    const res = await request(app()).get('/api/jobs/j2').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('j2');
  });

  it('GET /jobs/:id returns 404 for job owned by different session', async () => {
    createJob(db, { id: 'other-job', filename: 'x.m4b', uploadPath: '/tmp/x.m4b', sessionId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    const res = await request(app())
      .get('/api/jobs/other-job')
      .set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/jobs/:id/convert', () => {
  it('returns 200 with queued: true for ready job', async () => {
    createJob(db, { id: 'j3', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'j3', { status: 'ready' });

    const res = await request(app())
      .post('/api/jobs/j3/convert')
      .set('X-Session-ID', SESSION_ID)
      .send({ bitrate: 48 });
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(true);
    expect(res.body.position).toBeGreaterThan(0);
  });

  it('returns 409 for non-ready job', async () => {
    createJob(db, { id: 'j4', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    // status is 'pending' by default
    const res = await request(app())
      .post('/api/jobs/j4/convert')
      .set('X-Session-ID', SESSION_ID)
      .send({ bitrate: 48 });
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown job', async () => {
    const res = await request(app())
      .post('/api/jobs/nonexistent/convert')
      .set('X-Session-ID', SESSION_ID)
      .send({ bitrate: 48 });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/jobs/:id/cancel', () => {
  it('cancels a queued job and updates status', async () => {
    createJob(db, { id: 'j5', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'j5', { status: 'queued' });
    queue.enqueue('j5');

    const res = await request(app()).post('/api/jobs/j5/cancel').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(true);

    const job = getJob(db, 'j5');
    expect(job!.status).toBe('cancelled');
  });

  it('cancels a processing job, calls cancelCurrent and updates DB status', async () => {
    createJob(db, { id: 'j8', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'j8', { status: 'processing' });

    const res = await request(app()).post('/api/jobs/j8/cancel').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(true);

    expect((worker as unknown as { cancelCurrent: jest.Mock }).cancelCurrent).toHaveBeenCalled();

    const job = getJob(db, 'j8');
    expect(job!.status).toBe('cancelled');
  });

  it('returns 409 for non-cancellable status', async () => {
    createJob(db, { id: 'j6', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'j6', { status: 'complete' });

    const res = await request(app()).post('/api/jobs/j6/cancel').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/jobs/:id/test-encode', () => {
  it('returns 404 for unknown job', async () => {
    const res = await request(app())
      .post('/api/jobs/nonexistent/test-encode')
      .set('X-Session-ID', SESSION_ID)
      .send({ bitrate: 48 });
    expect(res.status).toBe(404);
  });

  it('returns 422 for a job without chapters', async () => {
    createJob(db, { id: 'jte1', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'jte1', { status: 'ready' });
    // no chapters set

    const res = await request(app())
      .post('/api/jobs/jte1/test-encode')
      .set('X-Session-ID', SESSION_ID)
      .send({ bitrate: 48 });
    expect(res.status).toBe(422);
  });

  it('returns 422 for a job in pending status (no chapters available)', async () => {
    createJob(db, { id: 'jte2', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    // status is 'pending' by default

    const res = await request(app())
      .post('/api/jobs/jte2/test-encode')
      .set('X-Session-ID', SESSION_ID)
      .send({ bitrate: 48 });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/jobs/:id', () => {
  it('returns 204 and removes job from DB', async () => {
    createJob(db, { id: 'j7', filename: 'book.m4b', uploadPath: '/tmp/nonexistent.m4b', sessionId: SESSION_ID });

    const res = await request(app()).delete('/api/jobs/j7').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(204);

    const job = getJob(db, 'j7');
    expect(job).toBeUndefined();
  });

  it('returns 404 for unknown job', async () => {
    const res = await request(app()).delete('/api/jobs/nonexistent').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
  });
});

describe('cross-session isolation', () => {
  it('GET /jobs/:id returns 404 for job owned by different session', async () => {
    createJob(db, { id: 'iso-get', filename: 'x.m4b', uploadPath: '/tmp/x.m4b', sessionId: OTHER_SESSION });
    const res = await request(app()).get('/api/jobs/iso-get').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
  });

  it('POST /jobs/:id/cancel returns 404 for job owned by different session', async () => {
    createJob(db, { id: 'iso-cancel', filename: 'x.m4b', uploadPath: '/tmp/x.m4b', sessionId: OTHER_SESSION });
    updateJob(db, 'iso-cancel', { status: 'queued' });
    const res = await request(app()).post('/api/jobs/iso-cancel/cancel').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
  });

  it('DELETE /jobs/:id returns 404 for job owned by different session', async () => {
    createJob(db, { id: 'iso-delete', filename: 'x.m4b', uploadPath: '/tmp/x.m4b', sessionId: OTHER_SESSION });
    const res = await request(app()).delete('/api/jobs/iso-delete').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
    // Job should still exist
    expect(getJob(db, 'iso-delete')).toBeDefined();
  });

  it('GET /jobs does not return jobs from other sessions', async () => {
    createJob(db, { id: 'iso-list-mine', filename: 'mine.m4b', uploadPath: '/tmp/mine.m4b', sessionId: SESSION_ID });
    createJob(db, { id: 'iso-list-other', filename: 'other.m4b', uploadPath: '/tmp/other.m4b', sessionId: OTHER_SESSION });
    const res = await request(app()).get('/api/jobs').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('iso-list-mine');
  });

  it('watch-sourced job (no sessionId) is accessible to any session', async () => {
    createJob(db, { id: 'watch-job', filename: 'watch.m4b', uploadPath: '/tmp/watch.m4b', source: 'watch' });
    const res = await request(app()).get('/api/jobs/watch-job').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('watch-job');
  });
});
