import fs from 'fs';
import Database from 'better-sqlite3';
import { getExpiredJobs, deleteJob } from '../db';

function safeDeleteFile(filePath: string | undefined): void {
  if (!filePath) return;
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // ignore — file may already be gone
  }
}

function safeDeleteDir(dirPath: string | undefined): void {
  if (!dirPath) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore — directory may already be gone
  }
}

export function runCleanup(db: Database.Database): void {
  const expired = getExpiredJobs(db);
  for (const job of expired) {
    safeDeleteFile(job.uploadPath);
    safeDeleteDir(job.outputDir);
    safeDeleteFile(job.zipPath);
    deleteJob(db, job.id);
    console.log(`[Cleanup] Deleted expired job ${job.id} (${job.filename})`);
  }
}

export function startCleanupScheduler(db: Database.Database, intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  runCleanup(db);  // run once immediately on startup
  return setInterval(() => runCleanup(db), intervalMs);
}
