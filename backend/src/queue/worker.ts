import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { JobQueue } from './job-queue';
import { getJob, updateJob } from '../db';
import { probeFile } from '../services/probe';
import { convertChapters } from '../services/converter';
import { createZip } from '../services/zipper';

const DATA_DIR = process.env.DATA_DIR ?? '/data';

export class Worker extends EventEmitter {
  private db: Database.Database;
  private queue: JobQueue;
  private abortController: AbortController | null = null;
  private running = false;
  private loopTimer: NodeJS.Timeout | null = null;

  constructor(db: Database.Database, queue: JobQueue) {
    super();
    this.db = db;
    this.queue = queue;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  cancelCurrent(): boolean {
    if (!this.abortController) return false;
    // eslint-disable-next-line no-console
    console.error(`[Worker] ABORT REQUEST: cancelling current job`);
    console.trace('[Worker] cancelCurrent called from:');
    this.abortController.abort();
    return true;
  }

  private loop(): void {
    if (!this.running) return;

    const jobId = this.queue.dequeue();
    if (!jobId) {
      this.loopTimer = setTimeout(() => this.loop(), 1000);
      return;
    }

    this.queue.setActive(jobId);
    this.processJob(jobId)
      .catch((err) => {
        console.error(`[Worker] Unhandled error for job ${jobId}:`, err);
      })
      .finally(() => {
        this.queue.setActive(null);
        this.abortController = null;
        setImmediate(() => this.loop());
      });
  }

  private async processJob(jobId: string): Promise<void> {
    const job = getJob(this.db, jobId);
    if (!job || job.status === 'cancelled') return;

    try {
      // Probe file if chapters not yet known
      let chapters = job.chapters;
      let totalDuration = job.totalDuration;
      let totalSize = job.totalSize;

      if (!chapters) {
        updateJob(this.db, jobId, { status: 'probing' });
        this.emit('job-status', { jobId, status: 'probing' });

        const probe = await probeFile(job.uploadPath);
        chapters = probe.chapters;
        totalDuration = probe.totalDuration;
        totalSize = probe.totalSize;
        updateJob(this.db, jobId, {
          chapters,
          chapterCount: chapters.length,
          totalDuration,
          totalSize,
        });
      }

      updateJob(this.db, jobId, { status: 'processing' });
      this.emit('job-status', { jobId, status: 'processing' });

      // Set up abort controller
      const ac = new AbortController();
      this.abortController = ac;

      // Create output directory
      const outputDir = path.join(DATA_DIR, 'output', jobId);
      fs.mkdirSync(outputDir, { recursive: true });
      updateJob(this.db, jobId, { outputDir });

      const bitrate = job.bitrate ?? 64;
      const totalChapters = chapters.length;
      let chaptersComplete = 0;

      // Convert chapters
      await convertChapters(
        {
          inputPath: job.uploadPath,
          chapters,
          bitrate,
          outputDir,
          signal: ac.signal,
        },
        {
          onChapterProgress: (progress) => {
            this.emit('progress', {
              jobId,
              chapterIndex: progress.chapterIndex,
              chapterTitle: progress.chapterTitle,
              percent: progress.percent,
            });
          },
          onChapterComplete: (chapterIndex, _outputPath, sizeBytes) => {
            chaptersComplete++;
            this.emit('chapter-complete', { jobId, chapterIndex, sizeBytes });
            this.emit('overall-progress', {
              jobId,
              percent: Math.round((chaptersComplete / totalChapters) * 100),
              chaptersComplete,
              totalChapters,
            });
          },
          onError: (chapterIndex, error) => {
            this.emit('job-error', {
              jobId,
              error: `Chapter ${chapterIndex} failed: ${error.message}`,
            });
          },
        }
      );

      // Create zip
      const zipPath = path.join(DATA_DIR, 'output', `${jobId}.zip`);
      await createZip(outputDir, zipPath);

      // Calculate output size
      const outputFiles = fs.readdirSync(outputDir);
      let outputSize = 0;
      for (const file of outputFiles) {
        outputSize += fs.statSync(path.join(outputDir, file)).size;
      }

      updateJob(this.db, jobId, {
        status: 'complete',
        zipPath,
        outputSize,
      });

      this.emit('job-complete', {
        jobId,
        zipPath,
        outputSizeBytes: outputSize,
      });
    } catch (err) {
      const isCancelled =
        (err instanceof Error && err.message.includes('cancel')) ||
        (err instanceof Error && err.message.includes('abort'));
      updateJob(this.db, jobId, {
        status: isCancelled ? 'cancelled' : 'error',
        errorMessage: isCancelled ? undefined : (err instanceof Error ? err.message : String(err)),
      });
      this.emit('job-error', {
        jobId,
        error: isCancelled ? 'Cancelled' : (err instanceof Error ? err.message : String(err)),
      });
    }
  }
}
