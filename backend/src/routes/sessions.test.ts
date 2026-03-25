import request from 'supertest';
import Database from 'better-sqlite3';
import { buildApp } from '../index';
import { initDb, createJob } from '../db';
import { JobQueue } from '../queue/job-queue';
import { Worker } from '../queue/worker';

describe('Sessions API', () => {
  let db: Database.Database;
  let app: any;

  beforeEach(() => {
    // Use temp dir for uploads to avoid permission issues
    process.env.DATA_DIR = '/tmp';
    db = initDb(':memory:');
    const queue = new JobQueue();
    const worker = new Worker(db, queue);
    app = buildApp({ db, queue, worker });
  });

  afterEach(() => {
    db.close();
    delete process.env.DATA_DIR;
  });

  const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

  describe('DELETE /api/sessions/:sessionId', () => {
    it('should delete session with no active jobs immediately', async () => {
      // Create some completed jobs
      createJob(db, {
        id: 'job1',
        filename: 'test1.m4b',
        uploadPath: '/tmp/test1.m4b',
        sessionId: SESSION_ID,
      });
      createJob(db, {
        id: 'job2',
        filename: 'test2.m4b',
        uploadPath: '/tmp/test2.m4b',
        sessionId: SESSION_ID,
      });

      // Mark jobs as complete (so they're not "active")
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('complete', 'job1');
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('complete', 'job2');

      const res = await request(app)
        .delete(`/api/sessions/${SESSION_ID}`)
        .set('X-Session-ID', SESSION_ID)
        .expect(200);

      expect(res.body).toEqual({ deleted: true, jobCount: 2 });

      // Verify jobs are gone
      const remaining = await request(app)
        .get('/api/jobs')
        .set('X-Session-ID', SESSION_ID)
        .expect(200);
      expect(remaining.body).toEqual([]);
    });

    it('should return inProgress: true when active jobs exist (no ?force)', async () => {
      createJob(db, {
        id: 'job1',
        filename: 'test1.m4b',
        uploadPath: '/tmp/test1.m4b',
        sessionId: SESSION_ID,
      });
      // Simulate a queued job
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('queued', 'job1');

      const res = await request(app)
        .delete(`/api/sessions/${SESSION_ID}`)
        .set('X-Session-ID', SESSION_ID)
        .expect(200);

      expect(res.body).toEqual({ inProgress: true, jobCount: 1 });

      // Job should still exist
      const jobs = await request(app)
        .get('/api/jobs')
        .set('X-Session-ID', SESSION_ID)
        .expect(200);
      expect(jobs.body).toHaveLength(1);
    });

    it('should force delete active jobs with ?force=true', async () => {
      createJob(db, {
        id: 'job1',
        filename: 'test1.m4b',
        uploadPath: '/tmp/test1.m4b',
        sessionId: SESSION_ID,
      });
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('processing', 'job1');

      const res = await request(app)
        .delete(`/api/sessions/${SESSION_ID}?force=true`)
        .set('X-Session-ID', SESSION_ID)
        .expect(200);

      expect(res.body).toEqual({ deleted: true, jobCount: 1 });

      // Job should be gone
      const jobs = await request(app)
        .get('/api/jobs')
        .set('X-Session-ID', SESSION_ID)
        .expect(200);
      expect(jobs.body).toEqual([]);
    });

    it('should return 403 when trying to delete another session', async () => {
      const OTHER_SESSION = '11111111-2222-3333-4444-555555555555';

      await request(app)
        .delete(`/api/sessions/${OTHER_SESSION}`)
        .set('X-Session-ID', SESSION_ID)
        .expect(403);
    });
  });

  describe('POST /api/sessions/:sessionId/close', () => {
    it('should behave like DELETE with force=true', async () => {
      createJob(db, {
        id: 'job1',
        filename: 'test1.m4b',
        uploadPath: '/tmp/test1.m4b',
        sessionId: SESSION_ID,
      });
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('queued', 'job1');

      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/close`)
        .set('X-Session-ID', SESSION_ID)
        .expect(200);

      expect(res.body).toEqual({ deleted: true, jobCount: 1 });

      // Job should be gone
      const jobs = await request(app)
        .get('/api/jobs')
        .set('X-Session-ID', SESSION_ID)
        .expect(200);
      expect(jobs.body).toEqual([]);
    });
  });
});