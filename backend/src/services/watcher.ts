import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import { createJob, getJob, updateJob } from '../db';
import { probeFile } from './probe';
import { JobQueue } from '../queue/job-queue';
import { Worker } from '../queue/worker';
import { notify } from './notifier';

const DATA_DIR = process.env.DATA_DIR ?? '/data';

export function startWatcher(
  watchDir: string,
  db: Database.Database,
  queue: JobQueue,
  worker: Worker,
): void {
  const watcher = chokidar.watch(watchDir, {
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 500,
    },
    ignoreInitial: true,
  });

  watcher.on('add', async (filePath: string) => {
    if (path.extname(filePath).toLowerCase() !== '.m4b') return;

    const id = uuid();
    const filename = path.basename(filePath);

    try {
      // Copy file to uploads directory
      const uploadsDir = path.join(DATA_DIR, 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const copyPath = path.join(uploadsDir, `${id}.m4b`);
      fs.copyFileSync(filePath, copyPath);

      // Create job in DB
      createJob(db, { id, filename, uploadPath: copyPath, source: 'watch' });

      // Probe the file
      let probe: Awaited<ReturnType<typeof probeFile>>;
      try {
        probe = await probeFile(copyPath);
      } catch (err) {
        console.error(`[Watcher] probeFile failed for ${filename}:`, err);
        updateJob(db, id, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const { chapters, totalDuration, totalSize } = probe;

      // Update job with probe results
      updateJob(db, id, {
        status: 'ready',
        chapters,
        totalDuration,
        totalSize,
        chapterCount: chapters.length,
      });

      // Set bitrate and mark as queued
      const bitrate = parseInt(process.env.WATCH_BITRATE ?? '48', 10);
      updateJob(db, id, { bitrate, status: 'queued' });

      // Enqueue
      queue.enqueue(id);

      console.log(`[Watcher] Queued ${filename} (${chapters.length} chapters, bitrate ${bitrate}k)`);
    } catch (err) {
      console.error(`[Watcher] Error processing ${filename}:`, err);
    }
  });

  // Send ntfy notification when a watch-folder job completes
  worker.on('job-complete', async ({ jobId }: { jobId: string }) => {
    try {
      const job = getJob(db, jobId);
      if (!job || job.source !== 'watch') return;

      await notify({
        title: 'Yoto Splitter',
        message: `Job complete: ${job.filename}`,
        priority: 'default',
      });
    } catch (err) {
      console.error('[Watcher] Error sending completion notification:', err);
    }
  });
}
