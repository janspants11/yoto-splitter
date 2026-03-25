import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDb, createJob, getJob } from '../db';
import { runCleanup } from './cleanup';

describe('runCleanup', () => {
  it('deletes expired jobs and their files', () => {
    const db = initDb(':memory:');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoto-cleanup-test-'));
    const uploadPath = path.join(tmpDir, 'test.m4b');
    fs.writeFileSync(uploadPath, 'data');

    db.prepare(`
      INSERT INTO jobs (id, filename, upload_path, source, session_id, status, expires_at)
      VALUES (?, ?, ?, 'upload', 'sess-1', 'ready', datetime('now', '-1 hour'))
    `).run('job-expired', 'test.m4b', uploadPath);

    runCleanup(db);

    expect(getJob(db, 'job-expired')).toBeUndefined();
    expect(fs.existsSync(uploadPath)).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
    db.close();
  });

  it('does not delete active jobs (queued/processing)', () => {
    const db = initDb(':memory:');

    db.prepare(`
      INSERT INTO jobs (id, filename, upload_path, source, session_id, status, expires_at)
      VALUES (?, ?, ?, 'upload', 'sess-1', 'processing', datetime('now', '-1 hour'))
    `).run('job-active', 'test.m4b', '/tmp/nonexistent.m4b');

    runCleanup(db);

    expect(getJob(db, 'job-active')).toBeDefined();
    db.close();
  });

  it('handles missing files gracefully (no throw)', () => {
    const db = initDb(':memory:');

    db.prepare(`
      INSERT INTO jobs (id, filename, upload_path, source, session_id, status, expires_at)
      VALUES (?, ?, ?, 'upload', 'sess-1', 'ready', datetime('now', '-1 hour'))
    `).run('job-missing-file', 'gone.m4b', '/tmp/this-does-not-exist.m4b');

    expect(() => runCleanup(db)).not.toThrow();
    expect(getJob(db, 'job-missing-file')).toBeUndefined();
    db.close();
  });

  it('does not delete non-expired jobs', () => {
    const db = initDb(':memory:');
    createJob(db, { id: 'fresh', filename: 'fresh.m4b', uploadPath: '/tmp/fresh.m4b', sessionId: 'sess-1' });

    runCleanup(db);

    expect(getJob(db, 'fresh')).toBeDefined();
    db.close();
  });
});
