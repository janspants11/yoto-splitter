import { Router } from 'express';
import path from 'path';
import Database from 'better-sqlite3';
import { getOwnedJob } from '../db';

export function createDownloadRouter(db: Database.Database) {
  const router = Router();

  // GET /:id - serve zip file for a completed job
  router.get('/:id', (req, res) => {
    const job = getOwnedJob(db, req.params.id, req.sessionId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'complete') {
      return res.status(409).json({ error: 'Job not complete' });
    }

    if (!job.zipPath) {
      return res.status(404).json({ error: 'No download available for this job' });
    }

    const downloadName = `${path.basename(job.filename, '.m4b')}.zip`;
    return res.download(job.zipPath, downloadName);
  });

  return router;
}
