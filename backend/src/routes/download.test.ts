import request from 'supertest';
import { buildApp } from '../index';
import { initDb, createJob, updateJob } from '../db';
import { JobQueue } from '../queue/job-queue';
import { Worker } from '../queue/worker';
import type Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SESSION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const OTHER_SESSION = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

let db: Database.Database;
let queue: JobQueue;
let worker: Worker;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoto-download-test-'));
  process.env.DATA_DIR = tmpDir;
  db = initDb(':memory:');
  queue = new JobQueue();
  const w = new EventEmitter();
  (w as unknown as { cancelCurrent: () => boolean }).cancelCurrent = jest.fn(() => true);
  worker = w as unknown as Worker;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function app() {
  return buildApp({ db, queue, worker });
}

describe('GET /api/download/:id', () => {
  it('returns 404 for unknown job ID', async () => {
    const res = await request(app()).get('/api/download/nonexistent').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('returns 409 for a job that is not complete', async () => {
    createJob(db, { id: 'd1', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'd1', { status: 'processing' });

    const res = await request(app()).get('/api/download/d1').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it('returns 409 for a queued job', async () => {
    createJob(db, { id: 'd2', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'd2', { status: 'queued' });

    const res = await request(app()).get('/api/download/d2').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(409);
  });

  it('returns the file when job is complete with a zipPath', async () => {
    // Create a real temp zip file to serve
    const zipFile = path.join(tmpDir, 'output.zip');
    fs.writeFileSync(zipFile, 'fake zip content');

    createJob(db, { id: 'd3', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'd3', { status: 'complete', zipPath: zipFile });

    const res = await request(app()).get('/api/download/d3').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('book.zip');
    expect(res.text).toBe('fake zip content');
  });

  it('returns 404 when job is complete but has no zipPath', async () => {
    createJob(db, { id: 'd4', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: SESSION_ID });
    updateJob(db, 'd4', { status: 'complete' });

    const res = await request(app()).get('/api/download/d4').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('returns 404 for complete job owned by different session', async () => {
    const zipFile = path.join(tmpDir, 'other.zip');
    fs.writeFileSync(zipFile, 'fake zip content');

    createJob(db, { id: 'd5', filename: 'book.m4b', uploadPath: '/uploads/book.m4b', sessionId: OTHER_SESSION });
    updateJob(db, 'd5', { status: 'complete', zipPath: zipFile });

    const res = await request(app()).get('/api/download/d5').set('X-Session-ID', SESSION_ID);
    expect(res.status).toBe(404);
  });
});
