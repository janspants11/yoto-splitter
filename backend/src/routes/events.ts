import { Router, Request, Response } from 'express';
import { Worker } from '../queue/worker';
import { getOwnedJob } from '../db';
import Database from 'better-sqlite3';

function sendSSE(res: Response, event: string, data: Record<string, unknown>): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createEventsRouter(db: Database.Database, worker: Worker) {
  const router = Router();

  // GET /:id - SSE stream for job progress
  router.get('/:id', (req: Request, res: Response) => {
    const jobId = req.params.id;

    const job = getOwnedJob(db, jobId, req.sessionId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('\n');

    // If job is already complete, send event and close
    if (job.status === 'complete') {
      sendSSE(res, 'complete', { jobId });
      res.end();
      return;
    }

    if (job.status === 'error') {
      sendSSE(res, 'error', { jobId, error: job.errorMessage ?? 'Unknown error' });
      res.end();
      return;
    }

    // Set up event listeners
    const onProgress = (event: { jobId: string; chapterIndex: number; chapterTitle: string; percent: number }) => {
      if (event.jobId !== jobId) return;
      sendSSE(res, 'progress', { chapterIndex: event.chapterIndex, chapterTitle: event.chapterTitle, chapterPercent: event.percent });
    };

    const onOverallProgress = (event: { jobId: string; percent: number; chaptersComplete: number; totalChapters: number }) => {
      if (event.jobId !== jobId) return;
      sendSSE(res, 'overall-progress', { overallPercent: event.percent, chaptersComplete: event.chaptersComplete, totalChapters: event.totalChapters });
    };

    const onChapterComplete = (event: { jobId: string; chapterIndex: number; sizeBytes: number }) => {
      if (event.jobId !== jobId) return;
      sendSSE(res, 'chapter-complete', { chapterIndex: event.chapterIndex, chaptersComplete: event.chapterIndex + 1, sizeBytes: event.sizeBytes });
    };

    const onJobComplete = (event: { jobId: string; zipPath: string; outputSizeBytes: number }) => {
      if (event.jobId !== jobId) return;
      sendSSE(res, 'complete', { zipPath: event.zipPath, outputSizeBytes: event.outputSizeBytes });
      cleanup();
      res.end();
    };

    const onJobError = (event: { jobId: string; error: string }) => {
      if (event.jobId !== jobId) return;
      sendSSE(res, 'error', { error: event.error });
      cleanup();
      res.end();
    };

    function cleanup() {
      worker.removeListener('progress', onProgress);
      worker.removeListener('overall-progress', onOverallProgress);
      worker.removeListener('chapter-complete', onChapterComplete);
      worker.removeListener('job-complete', onJobComplete);
      worker.removeListener('job-error', onJobError);
    }

    worker.on('progress', onProgress);
    worker.on('overall-progress', onOverallProgress);
    worker.on('chapter-complete', onChapterComplete);
    worker.on('job-complete', onJobComplete);
    worker.on('job-error', onJobError);

    // Clean up on client disconnect
    req.on('close', cleanup);
  });

  return router;
}
