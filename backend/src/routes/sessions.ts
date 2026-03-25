import { Router, Request, Response } from 'express';
import fs from 'fs';
import Database from 'better-sqlite3';
import { listActiveJobsBySession, deleteJobsBySession } from '../db';
import { Worker } from '../queue/worker';
import { JobQueue } from '../queue/job-queue';

export function createSessionsRouter(db: Database.Database, queue: JobQueue, worker: Worker) {
  const router = Router();

  function handleDelete(req: Request, res: Response) {
    const { sessionId } = req.params;

    // Only allow a session to delete itself
    if (sessionId !== req.sessionId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const force = req.query.force === 'true';
    const activeJobs = listActiveJobsBySession(db, sessionId);

    if (!force && activeJobs.length > 0) {
      return res.json({ inProgress: true, jobCount: activeJobs.length });
    }

    // Cancel any currently-processing job that belongs to this session
    const processingJob = activeJobs.find(j => j.status === 'processing');
    if (processingJob) {
      worker.cancelCurrent();
    }

    // Cancel any queued jobs that belong to this session
    for (const job of activeJobs) {
      if (job.status === 'queued') {
        queue.cancel(job.id);
      }
    }

    // Delete all jobs (files + DB rows)
    const deleted = deleteJobsBySession(db, sessionId);
    for (const job of deleted) {
      if (job.uploadPath) {
        try { fs.rmSync(job.uploadPath, { force: true }); } catch { /* ignore */ }
      }
      if (job.outputDir) {
        try { fs.rmSync(job.outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      if (job.zipPath) {
        try { fs.rmSync(job.zipPath, { force: true }); } catch { /* ignore */ }
      }
    }

    return res.json({ deleted: true, jobCount: deleted.length });
  }

  /**
   * DELETE /api/sessions/:sessionId
   *
   * First call (no ?force):
   *   - If jobs are currently active → 200 { inProgress: true, jobCount: N }
   *   - If no active jobs            → performs cleanup, 200 { deleted: true, jobCount: N }
   *
   * Second call (?force=true):
   *   - Cancels any in-progress work, deletes all session jobs + files, 200 { deleted: true, jobCount: N }
   *
   * The sessionId in the URL must match req.sessionId (set by sessionMiddleware).
   * This prevents one session from clearing another session's data.
   */
  router.delete('/:sessionId', handleDelete);

  /**
   * POST /api/sessions/:sessionId/close
   *
   * Identical behaviour to DELETE /:sessionId?force=true.
   * Exists solely so navigator.sendBeacon() can trigger cleanup on tab close
   * (sendBeacon only supports POST, not DELETE).
   */
  router.post('/:sessionId/close', (req, res) => {
    req.query = { ...req.query, force: 'true' };
    return handleDelete(req, res);
  });

  return router;
}
