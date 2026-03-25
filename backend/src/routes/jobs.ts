import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { listJobs, updateJob, deleteJob, getOwnedJob } from '../db';
import { JobQueue } from '../queue/job-queue';
import { Worker } from '../queue/worker';
import { convertChapters } from '../services/converter';
import { sanitizeTitle } from '../utils/sanitize';

export function createJobsRouter(db: Database.Database, queue: JobQueue, worker: Worker) {
  const router = Router();

  // GET / - list all jobs
  router.get('/', (req, res) => {
    const jobs = listJobs(db, 100, req.sessionId);
    res.json(jobs);
  });

  // GET /:id - get a single job
  router.get('/:id', (req, res) => {
    const job = getOwnedJob(db, req.params.id, req.sessionId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json(job);
  });

  // POST /:id/convert - enqueue a job for conversion
  router.post('/:id/convert', (req, res) => {
    const job = getOwnedJob(db, req.params.id, req.sessionId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (job.status !== 'ready') {
      return res.status(409).json({ error: `Cannot convert job with status '${job.status}'` });
    }

    const active = listJobs(db, 10, req.sessionId).filter(
      j => j.status === 'queued' || j.status === 'processing'
    );
    if (active.length > 0) {
      return res.status(409).json({ error: 'A conversion is already in progress for this session' });
    }

    const bitrate = req.body.bitrate ?? 48;
    updateJob(db, job.id, { status: 'queued', bitrate });
    queue.enqueue(job.id);

    return res.json({ queued: true, position: queue.getPosition(job.id) });
  });

  // POST /:id/cancel - cancel a queued or in-progress job
  router.post('/:id/cancel', (req, res) => {
    const job = getOwnedJob(db, req.params.id, req.sessionId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'queued') {
      queue.cancel(job.id);
      updateJob(db, job.id, { status: 'cancelled' });
      return res.json({ cancelled: true });
    }

    if (job.status === 'processing') {
      worker.cancelCurrent();
      updateJob(db, job.id, { status: 'cancelled' });
      return res.json({ cancelled: true });
    }

    return res.status(409).json({ error: `Cannot cancel job with status '${job.status}'` });
  });

  // POST /:id/test-encode - encode the shortest chapter at a given bitrate and return real size
  router.post('/:id/test-encode', async (req, res) => {
    const job = getOwnedJob(db, req.params.id, req.sessionId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const validStatuses = ['ready', 'queued', 'complete'];
    if (!validStatuses.includes(job.status) || !job.chapters || job.chapters.length === 0) {
      return res.status(422).json({ error: 'Job has no chapters available for test encode' });
    }

    const bitrate = req.body.bitrate;
    if (typeof bitrate !== 'number' || bitrate <= 0) {
      return res.status(400).json({ error: 'Invalid bitrate' });
    }

    const shortestChapter = job.chapters.reduce((min, ch) =>
      ch.duration < min.duration ? ch : min,
    );

    const paddedIndex = (shortestChapter.index + 1).toString().padStart(3, '0');
    const safeTitle = sanitizeTitle(shortestChapter.title);
    const outputFilename = `${paddedIndex} - ${safeTitle}.m4a`;
    const tempOutputPath = path.join('/tmp', outputFilename);

    try {
      await convertChapters({
        inputPath: job.uploadPath,
        chapters: [shortestChapter],
        bitrate,
        outputDir: '/tmp',
      });

      const stats = fs.statSync(tempOutputPath);
      const actualSizeBytes = stats.size;
      const actualMB = Math.round((actualSizeBytes / (1024 * 1024)) * 10) / 10;

      try { fs.unlinkSync(tempOutputPath); } catch { /* ignore */ }

      return res.json({
        chapterIndex: shortestChapter.index,
        chapterTitle: shortestChapter.title,
        bitrate,
        actualSizeBytes,
        actualMB,
        durationSeconds: shortestChapter.duration,
      });
    } catch (err) {
      try { fs.unlinkSync(tempOutputPath); } catch { /* ignore */ }
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Test encode failed',
      });
    }
  });

  // DELETE /:id - delete a job and its files
  router.delete('/:id', (req, res) => {
    const job = getOwnedJob(db, req.params.id, req.sessionId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Cancel if currently processing
    if (job.status === 'processing') {
      worker.cancelCurrent();
    }

    // Clean up files
    if (job.uploadPath) {
      try { fs.unlinkSync(job.uploadPath); } catch { /* ignore */ }
    }
    if (job.outputDir) {
      try { fs.rmSync(job.outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    if (job.zipPath) {
      try { fs.unlinkSync(job.zipPath); } catch { /* ignore */ }
    }

    deleteJob(db, job.id);
    return res.status(204).send();
  });

  return router;
}
