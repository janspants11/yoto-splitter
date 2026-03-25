import request from 'supertest';
import { buildApp } from '../index';
import { initDb } from '../db';
import { JobQueue } from '../queue/job-queue';
import { Worker } from '../queue/worker';
import type Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import os from 'os';

const SESSION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// Mock probeFile to avoid needing ffprobe
jest.mock('../services/probe', () => ({
  probeFile: jest.fn().mockResolvedValue({
    chapters: [
      { index: 0, title: 'Chapter 1', startTime: 0, endTime: 300, duration: 300 },
      { index: 1, title: 'Chapter 2', startTime: 300, endTime: 600, duration: 300 },
    ],
    totalDuration: 600,
    totalSize: 5000000,
    originalBitrate: 128,
  }),
}));

let db: Database.Database;
let queue: JobQueue;
let worker: Worker;
let tmpDir: string;

beforeEach(() => {
  db = initDb(':memory:');
  queue = new JobQueue();
  worker = new EventEmitter() as Worker;
  (worker as unknown as { cancelCurrent: () => boolean }).cancelCurrent = jest.fn(() => true);

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoto-upload-test-'));
  process.env.DATA_DIR = tmpDir;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function app() {
  return buildApp({ db, queue, worker });
}

describe('POST /api/upload', () => {
  it('rejects non-.m4b files with 400', async () => {
    const fakeFile = path.join(tmpDir, 'test.mp3');
    fs.writeFileSync(fakeFile, 'fake audio data');

    const res = await request(app())
      .post('/api/upload')
      .set('X-Session-ID', SESSION_ID)
      .attach('file', fakeFile);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('.m4b');
  });

  it('accepts .m4b files and returns job info', async () => {
    const fakeFile = path.join(tmpDir, 'audiobook.m4b');
    // Write a buffer with valid MP4 'ftyp' magic bytes at offset 4-7
    const buf = Buffer.alloc(16);
    buf.write('ftyp', 4, 'ascii');
    fs.writeFileSync(fakeFile, buf);

    const res = await request(app())
      .post('/api/upload')
      .set('X-Session-ID', SESSION_ID)
      .attach('file', fakeFile);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.filename).toBe('audiobook.m4b');
    expect(res.body.chapters).toHaveLength(2);
    expect(res.body.format.totalDuration).toBe(600);
    expect(res.body.estimates).toBeDefined();
    expect(res.body.estimates.length).toBeGreaterThan(0);
  });
});
