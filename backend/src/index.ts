import express from 'express';
import Database from 'better-sqlite3';
import { authMiddleware } from './middleware/auth';
import { sessionMiddleware } from './middleware/session';
import { initDb } from './db';
import { JobQueue } from './queue/job-queue';
import { Worker } from './queue/worker';
import { createUploadRouter } from './routes/upload';
import { createJobsRouter } from './routes/jobs';
import { createDownloadRouter } from './routes/download';
import { createEventsRouter } from './routes/events';
import { createSessionsRouter } from './routes/sessions';
import { startWatcher } from './services/watcher';
import { startCleanupScheduler } from './services/cleanup';

export interface AppContext {
  db: Database.Database;
  queue: JobQueue;
  worker: Worker;
}

export function buildApp(ctx?: AppContext) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(authMiddleware());

  // Health endpoint must be before sessionMiddleware (no session header required)
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api', sessionMiddleware);

  if (ctx) {
    app.use('/api/upload', createUploadRouter(ctx.db));
    app.use('/api/jobs', createJobsRouter(ctx.db, ctx.queue, ctx.worker));
    app.use('/api/download', createDownloadRouter(ctx.db));
    app.use('/api/events', createEventsRouter(ctx.db, ctx.worker));
    app.use('/api/sessions', createSessionsRouter(ctx.db, ctx.queue, ctx.worker));
  }

  return app;
}

if (require.main === module) {
  const db = initDb();
  const queue = new JobQueue();
  const worker = new Worker(db, queue);
  worker.start();

  const app = buildApp({ db, queue, worker });
  const port = process.env.PORT ?? 4000;

  startCleanupScheduler(db);

  const watchDir = process.env.WATCH_DIR;
  if (watchDir) {
    startWatcher(watchDir, db, queue, worker);
    console.log(`[Watcher] Watching ${watchDir} for .m4b files`);
  }

  app.listen(port, () => console.log(`yoto-splitter backend running on :${port}`));
}
