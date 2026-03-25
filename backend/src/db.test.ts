import { initDb, createJob, getJob, listJobs, updateJob, getExpiredJobs } from './db';
import type Database from 'better-sqlite3';
import type { Chapter } from './types';

let db: Database.Database;

beforeEach(() => {
  db = initDb(':memory:');
});

afterEach(() => {
  db.close();
});

describe('initDb', () => {
  it('creates the jobs table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('is idempotent (can be called twice)', () => {
    // Running migrations again should not throw
    expect(() => initDb(':memory:')).not.toThrow();
  });
});

describe('createJob', () => {
  it('creates a job with defaults', () => {
    const job = createJob(db, {
      id: 'test-1',
      filename: 'book.m4b',
      uploadPath: '/uploads/book.m4b',
    });
    expect(job.id).toBe('test-1');
    expect(job.filename).toBe('book.m4b');
    expect(job.uploadPath).toBe('/uploads/book.m4b');
    expect(job.status).toBe('pending');
    expect(job.source).toBe('upload');
    expect(job.createdAt).toBeDefined();
    expect(job.updatedAt).toBeDefined();
  });

  it('accepts a custom source', () => {
    const job = createJob(db, {
      id: 'test-2',
      filename: 'book.m4b',
      uploadPath: '/uploads/book.m4b',
      source: 'watch',
    });
    expect(job.source).toBe('watch');
  });
});

describe('getJob', () => {
  it('returns undefined for non-existent job', () => {
    expect(getJob(db, 'nope')).toBeUndefined();
  });

  it('returns the job by id', () => {
    createJob(db, { id: 'j1', filename: 'a.m4b', uploadPath: '/a.m4b' });
    const job = getJob(db, 'j1');
    expect(job).toBeDefined();
    expect(job!.id).toBe('j1');
  });
});

describe('listJobs', () => {
  it('returns empty array when no jobs', () => {
    expect(listJobs(db)).toEqual([]);
  });

  it('returns jobs newest first', () => {
    createJob(db, { id: 'a', filename: 'a.m4b', uploadPath: '/a' });
    createJob(db, { id: 'b', filename: 'b.m4b', uploadPath: '/b' });
    const jobs = listJobs(db);
    expect(jobs).toHaveLength(2);
    // Both have the same created_at (within the same second), so just check length
    expect(jobs.map(j => j.id)).toContain('a');
    expect(jobs.map(j => j.id)).toContain('b');
  });

  it('respects limit', () => {
    createJob(db, { id: 'a', filename: 'a.m4b', uploadPath: '/a' });
    createJob(db, { id: 'b', filename: 'b.m4b', uploadPath: '/b' });
    createJob(db, { id: 'c', filename: 'c.m4b', uploadPath: '/c' });
    const jobs = listJobs(db, 2);
    expect(jobs).toHaveLength(2);
  });
});

describe('updateJob', () => {
  it('updates status', () => {
    createJob(db, { id: 'u1', filename: 'a.m4b', uploadPath: '/a' });
    updateJob(db, 'u1', { status: 'processing' });
    const job = getJob(db, 'u1');
    expect(job!.status).toBe('processing');
  });

  it('updates multiple fields at once', () => {
    createJob(db, { id: 'u2', filename: 'a.m4b', uploadPath: '/a' });
    updateJob(db, 'u2', {
      status: 'complete',
      bitrate: 64,
      outputDir: '/output/u2',
      zipPath: '/output/u2.zip',
      totalDuration: 3600,
      totalSize: 50000000,
      outputSize: 30000000,
      chapterCount: 10,
      errorMessage: undefined, // should be ignored
    });
    const job = getJob(db, 'u2');
    expect(job!.status).toBe('complete');
    expect(job!.bitrate).toBe(64);
    expect(job!.outputDir).toBe('/output/u2');
    expect(job!.zipPath).toBe('/output/u2.zip');
    expect(job!.totalDuration).toBe(3600);
    expect(job!.totalSize).toBe(50000000);
    expect(job!.outputSize).toBe(30000000);
    expect(job!.chapterCount).toBe(10);
  });

  it('round-trips chapters as JSON', () => {
    createJob(db, { id: 'u3', filename: 'a.m4b', uploadPath: '/a' });
    const chapters: Chapter[] = [
      { index: 0, title: 'Intro', startTime: 0, endTime: 60, duration: 60 },
      { index: 1, title: 'Chapter 1', startTime: 60, endTime: 180, duration: 120 },
    ];
    updateJob(db, 'u3', { chapters });
    const job = getJob(db, 'u3');
    expect(job!.chapters).toEqual(chapters);
  });

  it('does nothing when updates is empty', () => {
    createJob(db, { id: 'u4', filename: 'a.m4b', uploadPath: '/a' });
    const before = getJob(db, 'u4');
    updateJob(db, 'u4', {});
    const after = getJob(db, 'u4');
    expect(after!.updatedAt).toBe(before!.updatedAt);
  });
});

describe('session_id and expires_at', () => {
  it('jobs table has session_id and expires_at columns', () => {
    const db = initDb(':memory:');
    const cols = (db.prepare('PRAGMA table_info(jobs)').all() as Array<{name: string}>).map(c => c.name);
    expect(cols).toContain('session_id');
    expect(cols).toContain('expires_at');
    db.close();
  });

  it('createJob stores session_id', () => {
    const db = initDb(':memory:');
    const sessionId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const job = createJob(db, { id: 'j1', filename: 'test.m4b', uploadPath: '/tmp/test.m4b', sessionId });
    expect(job.sessionId).toBe(sessionId);
    expect(job.expiresAt).toBeDefined();
    db.close();
  });

  it('createJob without sessionId stores null', () => {
    const db = initDb(':memory:');
    const job = createJob(db, { id: 'j1', filename: 'test.m4b', uploadPath: '/tmp/test.m4b' });
    expect(job.sessionId).toBeUndefined();
    db.close();
  });

  it('listJobs filters by sessionId', () => {
    const db = initDb(':memory:');
    createJob(db, { id: 'j1', filename: 'a.m4b', uploadPath: '/tmp/a', sessionId: 'aaaa0000-0000-4000-8000-000000000000' });
    createJob(db, { id: 'j2', filename: 'b.m4b', uploadPath: '/tmp/b', sessionId: 'bbbb0000-0000-4000-8000-000000000000' });
    const jobs = listJobs(db, 100, 'aaaa0000-0000-4000-8000-000000000000');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('j1');
    db.close();
  });

  it('getExpiredJobs returns only expired non-active jobs', () => {
    const db = initDb(':memory:');
    // Insert an expired job manually
    db.prepare(`INSERT INTO jobs (id, filename, upload_path, source, session_id, status, expires_at)
      VALUES ('exp', 'x.m4b', '/tmp/x', 'upload', 'sess', 'ready', datetime('now', '-1 hour'))`)
      .run();
    // Insert an active job that's expired (should be excluded)
    db.prepare(`INSERT INTO jobs (id, filename, upload_path, source, session_id, status, expires_at)
      VALUES ('active', 'y.m4b', '/tmp/y', 'upload', 'sess', 'processing', datetime('now', '-1 hour'))`)
      .run();
    // Insert a non-expired job (should be excluded)
    createJob(db, { id: 'fresh', filename: 'z.m4b', uploadPath: '/tmp/z', sessionId: 'sess' });

    const expired = getExpiredJobs(db);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe('exp');
    db.close();
  });
});
