import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Job, JobStatus, JobSource, Chapter } from './types';

const DATA_DIR = process.env.DATA_DIR ?? '/data';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id             TEXT PRIMARY KEY,
  filename       TEXT NOT NULL,
  upload_path    TEXT NOT NULL,
  output_dir     TEXT,
  zip_path       TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  bitrate        INTEGER,
  total_duration REAL,
  total_size     INTEGER,
  output_size    INTEGER,
  chapter_count  INTEGER,
  chapters_json  TEXT,
  error_message  TEXT,
  source         TEXT NOT NULL DEFAULT 'upload',
  session_id     TEXT,
  expires_at     TEXT NOT NULL DEFAULT (datetime('now', '+24 hours')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
`;

interface JobRow {
  id: string;
  filename: string;
  upload_path: string;
  output_dir: string | null;
  zip_path: string | null;
  status: string;
  bitrate: number | null;
  total_duration: number | null;
  total_size: number | null;
  output_size: number | null;
  chapter_count: number | null;
  chapters_json: string | null;
  error_message: string | null;
  source: string;
  session_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    filename: row.filename,
    uploadPath: row.upload_path,
    outputDir: row.output_dir ?? undefined,
    zipPath: row.zip_path ?? undefined,
    status: row.status as JobStatus,
    bitrate: row.bitrate ?? undefined,
    totalDuration: row.total_duration ?? undefined,
    totalSize: row.total_size ?? undefined,
    outputSize: row.output_size ?? undefined,
    chapterCount: row.chapter_count ?? undefined,
    chapters: row.chapters_json ? JSON.parse(row.chapters_json) : undefined,
    errorMessage: row.error_message ?? undefined,
    source: row.source as JobSource,
    sessionId: row.session_id ?? undefined,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function initDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(DATA_DIR, 'yoto.db');

  // Ensure parent directory exists (skip for :memory:)
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  const cols = (db.prepare('PRAGMA table_info(jobs)').all() as Array<{name: string}>).map(c => c.name);
  if (!cols.includes('session_id')) {
    db.exec("ALTER TABLE jobs ADD COLUMN session_id TEXT");
  }
  if (!cols.includes('expires_at')) {
    db.exec("ALTER TABLE jobs ADD COLUMN expires_at TEXT");
    db.exec("UPDATE jobs SET expires_at = datetime('now', '+24 hours') WHERE expires_at IS NULL");
  }
  // Always ensure these indexes exist (covers both fresh installs and migrations)
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_session_id ON jobs(session_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at)");
}

export function createJob(db: Database.Database, job: {
  id: string;
  filename: string;
  uploadPath: string;
  source?: JobSource;
  sessionId?: string;
}): Job {
  const source = job.source ?? 'upload';
  const stmt = db.prepare(`
    INSERT INTO jobs (id, filename, upload_path, source, session_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(job.id, job.filename, job.uploadPath, source, job.sessionId ?? null);
  return getJob(db, job.id)!;
}

export function getJob(db: Database.Database, id: string): Job | undefined {
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
  const row = stmt.get(id) as JobRow | undefined;
  return row ? rowToJob(row) : undefined;
}

export function listJobs(db: Database.Database, limit: number = 100, sessionId?: string): Job[] {
  if (sessionId) {
    const stmt = db.prepare('SELECT * FROM jobs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?');
    return (stmt.all(sessionId, limit) as JobRow[]).map(rowToJob);
  }
  const stmt = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?');
  return (stmt.all(limit) as JobRow[]).map(rowToJob);
}

export function getExpiredJobs(db: Database.Database): Job[] {
  const stmt = db.prepare(
    "SELECT * FROM jobs WHERE expires_at < datetime('now') AND status NOT IN ('pending', 'probing', 'queued', 'processing')"
  );
  return (stmt.all() as JobRow[]).map(rowToJob);
}

/**
 * Return a job only if it is owned by the given session.
 * Watch-sourced jobs (sessionId === undefined) are accessible to any session.
 */
export function getOwnedJob(db: Database.Database, id: string, sessionId: string): Job | null {
  const job = getJob(db, id);
  if (!job) return null;
  // Watch-sourced jobs have no sessionId — allow any authenticated session to access them
  if (job.sessionId !== undefined && job.sessionId !== sessionId) return null;
  return job;
}

export function updateJob(db: Database.Database, id: string, updates: Partial<{
  status: JobStatus;
  outputDir: string;
  zipPath: string;
  bitrate: number;
  totalDuration: number;
  totalSize: number;
  outputSize: number;
  chapterCount: number;
  chapters: Chapter[];
  errorMessage: string;
}>): void {
  const columnMap: Record<string, string> = {
    status: 'status',
    outputDir: 'output_dir',
    zipPath: 'zip_path',
    bitrate: 'bitrate',
    totalDuration: 'total_duration',
    totalSize: 'total_size',
    outputSize: 'output_size',
    chapterCount: 'chapter_count',
    chapters: 'chapters_json',
    errorMessage: 'error_message',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const column = columnMap[key];
    if (!column) continue;
    setClauses.push(`${column} = ?`);
    values.push(key === 'chapters' ? JSON.stringify(value) : value);
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = datetime('now')");
  values.push(id);

  const sql = `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);
}

export function deleteJob(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

/** Return all jobs for a session that are currently active (pending / queued / processing / probing). */
export function listActiveJobsBySession(db: Database.Database, sessionId: string): Job[] {
  const stmt = db.prepare(
    "SELECT * FROM jobs WHERE session_id = ? AND status IN ('pending','probing','queued','processing')"
  );
  return (stmt.all(sessionId) as JobRow[]).map(rowToJob);
}

/** Delete all jobs belonging to a session and return the deleted rows (for file cleanup). */
export function deleteJobsBySession(db: Database.Database, sessionId: string): Job[] {
  const jobs = (
    db.prepare('SELECT * FROM jobs WHERE session_id = ?').all(sessionId) as JobRow[]
  ).map(rowToJob);
  db.prepare('DELETE FROM jobs WHERE session_id = ?').run(sessionId);
  return jobs;
}
