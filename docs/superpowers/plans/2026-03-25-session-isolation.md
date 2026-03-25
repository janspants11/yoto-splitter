# Session Isolation & TTL Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope all job data to per-visitor session tokens and auto-delete files after 24 hours, making the app safe to expose publicly.

**Architecture:** Client generates a UUID v4 session token on first visit, persists it in `localStorage`, and sends it as `X-Session-ID` on every request. The backend stores `session_id` on each job and enforces isolation — list/get/convert/download/events all require the caller to own the job. A background cleanup service deletes files and DB rows for jobs older than 24h. Watch-folder jobs use `session_id = null` (server-owned, not exposed via API).

**Tech Stack:** TypeScript, Express, better-sqlite3 (SQLite ALTER TABLE migration), uuid (already a dependency), Node.js `setInterval` for cleanup scheduling.

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/api/client.ts` | Generate/persist session UUID; send `X-Session-ID` on all requests incl. XHR upload |
| `backend/src/middleware/session.ts` | **NEW** — extract + validate UUID from header, attach to `req.sessionId` |
| `backend/src/middleware/auth/index.ts` | Wire session middleware after auth |
| `backend/src/db.ts` | Add `session_id` + `expires_at` columns via migration; update `createJob`, `listJobs`, `getJob` |
| `backend/src/types.ts` | Add `sessionId` + `expiresAt` to `Job` interface |
| `backend/src/routes/upload.ts` | Pass `session_id` to `createJob`; set `expires_at` |
| `backend/src/routes/jobs.ts` | Filter list by session; ownership checks on single-job ops; rate-limit concurrent conversions per session |
| `backend/src/routes/download.ts` | Ownership check |
| `backend/src/routes/events.ts` | Ownership check |
| `backend/src/services/cleanup.ts` | **NEW** — find expired jobs, delete files + DB rows |
| `backend/src/index.ts` | Start cleanup scheduler on boot |

---

## Task 1: Frontend session token

**Files:**
- Modify: `frontend/src/api/client.ts`

The client generates a UUID v4 on first load using `crypto.randomUUID()` (built into all modern browsers), stores it in `localStorage`, and sends it as `X-Session-ID` on every request. The XHR upload path needs the header too.

- [ ] **Step 1: Add session token to `client.ts`**

Replace the top of `frontend/src/api/client.ts` with:

```typescript
const BASE = '/api';

function getSessionId(): string {
  const key = 'yoto-session-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function sessionHeaders(): Record<string, string> {
  return { 'X-Session-ID': getSessionId() };
}

function get<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { headers: sessionHeaders() }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });
}

function post<T>(path: string, body: object): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });
}
```

Also add `xhr.setRequestHeader('X-Session-ID', getSessionId());` inside `uploadWithProgress` after `xhr.open(...)`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: generate and send X-Session-ID header from frontend"
```

---

## Task 2: Backend session middleware

**Files:**
- Create: `backend/src/middleware/session.ts`
- Modify: `backend/src/index.ts`

The middleware rejects requests missing a valid UUID `X-Session-ID` header. Watch-folder routes (watcher.ts, internal queue) bypass this middleware — they don't go through HTTP.

- [ ] **Step 1: Write the failing test**

Create `backend/src/middleware/session.test.ts`:

```typescript
import express from 'express';
import request from 'supertest';
import { sessionMiddleware } from './session';

function makeApp() {
  const app = express();
  app.use(sessionMiddleware);
  app.get('/test', (req: any, res) => res.json({ sessionId: req.sessionId }));
  return app;
}

describe('sessionMiddleware', () => {
  it('rejects requests with no X-Session-ID header', async () => {
    const res = await request(makeApp()).get('/test');
    expect(res.status).toBe(400);
  });

  it('rejects requests with an invalid UUID', async () => {
    const res = await request(makeApp()).get('/test').set('X-Session-ID', 'not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('passes valid UUID and attaches to req.sessionId', async () => {
    const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const res = await request(makeApp()).get('/test').set('X-Session-ID', id);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- --testPathPattern=session.test
```
Expected: FAIL — `sessionMiddleware` not found.

- [ ] **Step 3: Create `backend/src/middleware/session.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare global {
  namespace Express {
    interface Request {
      sessionId: string;
    }
  }
}

export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = req.headers['x-session-id'];
  if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
    res.status(400).json({ error: 'Missing or invalid X-Session-ID header' });
    return;
  }
  req.sessionId = id;
  next();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npm test -- --testPathPattern=session.test
```
Expected: PASS (3 tests).

- [ ] **Step 5: Wire middleware into `backend/src/index.ts`**

In `buildApp()`, after `app.use(authMiddleware(...))`, add:

```typescript
import { sessionMiddleware } from './middleware/session';
// ...
app.use('/api', sessionMiddleware);
```

This applies to all `/api/*` routes. The health check endpoint (if any exists outside `/api`) is unaffected.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/session.ts backend/src/middleware/session.test.ts backend/src/index.ts
git commit -m "feat: session middleware — require valid UUID X-Session-ID on all /api routes"
```

---

## Task 3: DB schema migration

**Files:**
- Modify: `backend/src/db.ts`
- Modify: `backend/src/types.ts`

Add two columns to the `jobs` table:
- `session_id TEXT` — nullable (NULL for watch-sourced jobs)
- `expires_at TEXT` — ISO datetime when job files should be purged (set at create time: `datetime('now', '+24 hours')`)

SQLite does not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Use a pragma-based migration: check `PRAGMA table_info(jobs)` for the column before running ALTER TABLE.

- [ ] **Step 1: Write the failing test**

In `backend/src/db.test.ts`, add:

```typescript
it('jobs table has session_id and expires_at columns', () => {
  const db = initDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(jobs)").all() as Array<{name: string}>;
  const names = cols.map(c => c.name);
  expect(names).toContain('session_id');
  expect(names).toContain('expires_at');
});

it('createJob stores session_id', () => {
  const db = initDb(':memory:');
  const job = createJob(db, { id: 'j1', filename: 'test.m4b', uploadPath: '/tmp/test.m4b', sessionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
  expect(job.sessionId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
});

it('listJobs filters by sessionId', () => {
  const db = initDb(':memory:');
  createJob(db, { id: 'j1', filename: 'a.m4b', uploadPath: '/tmp/a', sessionId: 'aaaa0000-0000-4000-8000-000000000000' });
  createJob(db, { id: 'j2', filename: 'b.m4b', uploadPath: '/tmp/b', sessionId: 'bbbb0000-0000-4000-8000-000000000000' });
  const jobs = listJobs(db, 100, 'aaaa0000-0000-4000-8000-000000000000');
  expect(jobs).toHaveLength(1);
  expect(jobs[0].id).toBe('j1');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- --testPathPattern=db.test
```
Expected: FAIL on the new tests.

- [ ] **Step 3: Update `backend/src/types.ts`**

Add to the `Job` interface:
```typescript
sessionId?: string;   // null for watch-sourced jobs
expiresAt: string;    // ISO datetime
```

- [ ] **Step 4: Update `backend/src/db.ts`**

**Migration helper** — add after `const db = new Database(resolvedPath);`:

```typescript
function runMigrations(db: Database.Database): void {
  const cols = (db.prepare('PRAGMA table_info(jobs)').all() as Array<{name: string}>).map(c => c.name);
  if (!cols.includes('session_id')) {
    db.exec("ALTER TABLE jobs ADD COLUMN session_id TEXT");
  }
  if (!cols.includes('expires_at')) {
    db.exec("ALTER TABLE jobs ADD COLUMN expires_at TEXT NOT NULL DEFAULT (datetime('now', '+24 hours'))");
  }
}
```

Call `runMigrations(db)` after `db.exec(SCHEMA)`.

**Update `SCHEMA`** — add the columns to `CREATE TABLE IF NOT EXISTS jobs`:
```sql
  session_id     TEXT,
  expires_at     TEXT NOT NULL DEFAULT (datetime('now', '+24 hours')),
```

**Update `JobRow` interface**:
```typescript
session_id: string | null;
expires_at: string;
```

**Update `rowToJob`**:
```typescript
sessionId: row.session_id ?? undefined,
expiresAt: row.expires_at,
```

**Update `createJob`** signature:
```typescript
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
```

**Update `listJobs`** to accept optional `sessionId`:
```typescript
export function listJobs(db: Database.Database, limit: number = 100, sessionId?: string): Job[] {
  if (sessionId) {
    const stmt = db.prepare('SELECT * FROM jobs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?');
    return (stmt.all(sessionId, limit) as JobRow[]).map(rowToJob);
  }
  const stmt = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?');
  return (stmt.all(limit) as JobRow[]).map(rowToJob);
}
```

Add a new helper for cleanup (used by the cleanup service):
```typescript
export function getExpiredJobs(db: Database.Database): Job[] {
  const stmt = db.prepare("SELECT * FROM jobs WHERE expires_at < datetime('now') AND status NOT IN ('queued', 'processing')");
  return (stmt.all() as JobRow[]).map(rowToJob);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && npm test -- --testPathPattern=db.test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db.ts backend/src/types.ts
git commit -m "feat: add session_id and expires_at to jobs schema with migration"
```

---

## Task 4: Scope all routes to session

**Files:**
- Modify: `backend/src/routes/upload.ts`
- Modify: `backend/src/routes/jobs.ts`
- Modify: `backend/src/routes/download.ts`
- Modify: `backend/src/routes/events.ts`

**upload.ts**: pass `req.sessionId` to `createJob`.

**jobs.ts**:
- `GET /` → `listJobs(db, 100, req.sessionId)`
- `GET /:id` → after `getJob`, check `job.sessionId === req.sessionId`, return 404 if not owned
- `POST /:id/convert` → ownership check, then **rate-limit**: query for any active job in session before queuing
- `POST /:id/test-encode` → ownership check
- `POST /:id/cancel` → ownership check
- `DELETE /:id` → ownership check

**download.ts**: ownership check — if `job.sessionId !== req.sessionId`, return 403.

**events.ts**: ownership check — if `job.sessionId !== req.sessionId`, return 403.

- [ ] **Step 1: Update route tests to pass session header**

In `backend/src/routes/upload.test.ts`, `jobs.test.ts`, `download.test.ts`, `events.test.ts` — add `.set('X-Session-ID', SESSION_ID)` to all test requests. Add a `SESSION_ID` constant at the top:

```typescript
const SESSION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
```

Also add a test for cross-session isolation in `jobs.test.ts`:

```typescript
it('GET /jobs/:id returns 404 for a job owned by a different session', async () => {
  // create job with session A
  // request with session B
  // expect 404
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npm test -- --testPathPattern=routes
```
Expected: many failures (missing session header, ownership not enforced).

- [ ] **Step 3: Update `upload.ts`**

Change `createJob(db, { id, filename, uploadPath: dest })` to:
```typescript
createJob(db, { id, filename, uploadPath: dest, sessionId: req.sessionId })
```

- [ ] **Step 4: Update `jobs.ts`**

Add ownership check helper at the top of the router factory:
```typescript
function ownedJob(db: Database.Database, id: string, sessionId: string) {
  const job = getJob(db, id);
  if (!job || job.sessionId !== sessionId) return null;
  return job;
}
```

Update each handler:
- `GET /` → `listJobs(db, 100, req.sessionId)`
- `GET /:id` → use `ownedJob`, return 404 if null
- `POST /:id/convert` → use `ownedJob`; before enqueuing, check:
  ```typescript
  const activeJobs = listJobs(db, 10, req.sessionId).filter(j =>
    j.status === 'queued' || j.status === 'processing'
  );
  if (activeJobs.length > 0) {
    return res.status(409).json({ error: 'A conversion is already in progress' });
  }
  ```
- `POST /:id/test-encode` → use `ownedJob`
- `POST /:id/cancel` → use `ownedJob`
- `DELETE /:id` → use `ownedJob`

- [ ] **Step 5: Update `download.ts`**

Replace `getJob(db, jobId)` check with:
```typescript
const job = getJob(db, jobId);
if (!job || job.sessionId !== req.sessionId) {
  return res.status(404).json({ error: 'Job not found' });
}
```

- [ ] **Step 6: Update `events.ts`**

Same ownership check as download.ts after retrieving the job.

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend && npm test -- --testPathPattern=routes
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/
git commit -m "feat: scope all routes to session — ownership checks + concurrent conversion rate limit"
```

---

## Task 5: TTL cleanup service

**Files:**
- Create: `backend/src/services/cleanup.ts`
- Modify: `backend/src/index.ts`

Runs every hour. For each expired job:
1. Delete upload file at `job.uploadPath`
2. Delete output directory at `job.outputDir` (recursive)
3. Delete zip at `job.zipPath`
4. Delete the DB row

Skip deletion of files that don't exist (already cleaned up or never created).

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/cleanup.test.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDb, createJob, getJob } from '../db';
import { runCleanup } from './cleanup';

describe('runCleanup', () => {
  it('deletes expired jobs and their files', () => {
    const db = initDb(':memory:');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoto-test-'));
    const uploadPath = path.join(tmpDir, 'test.m4b');
    fs.writeFileSync(uploadPath, 'data');

    // Insert an already-expired job by manipulating expires_at
    db.prepare(`
      INSERT INTO jobs (id, filename, upload_path, source, session_id, status, expires_at)
      VALUES (?, ?, ?, 'upload', 'sess-1', 'ready', datetime('now', '-1 hour'))
    `).run('job-expired', 'test.m4b', uploadPath);

    runCleanup(db);

    expect(getJob(db, 'job-expired')).toBeUndefined();
    expect(fs.existsSync(uploadPath)).toBe(false);

    fs.rmdirSync(tmpDir);
  });

  it('does not delete active jobs (queued/processing)', () => {
    const db = initDb(':memory:');
    db.prepare(`
      INSERT INTO jobs (id, filename, upload_path, source, session_id, status, expires_at)
      VALUES (?, ?, ?, 'upload', 'sess-1', 'processing', datetime('now', '-1 hour'))
    `).run('job-active', 'test.m4b', '/tmp/nonexistent.m4b');

    runCleanup(db);

    expect(getJob(db, 'job-active')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- --testPathPattern=cleanup.test
```
Expected: FAIL — `runCleanup` not found.

- [ ] **Step 3: Create `backend/src/services/cleanup.ts`**

```typescript
import fs from 'fs';
import Database from 'better-sqlite3';
import { getExpiredJobs, deleteJob } from '../db';

function safeDelete(filePath: string | undefined): void {
  if (!filePath) return;
  try {
    fs.rmSync(filePath, { recursive: true, force: true });
  } catch {
    // ignore — file may already be gone
  }
}

export function runCleanup(db: Database.Database): void {
  const expired = getExpiredJobs(db);
  for (const job of expired) {
    safeDelete(job.uploadPath);
    safeDelete(job.outputDir);
    safeDelete(job.zipPath);
    deleteJob(db, job.id);
    console.log(`[Cleanup] Deleted expired job ${job.id} (${job.filename})`);
  }
}

export function startCleanupScheduler(db: Database.Database, intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  // Run once immediately on startup, then on interval
  runCleanup(db);
  return setInterval(() => runCleanup(db), intervalMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npm test -- --testPathPattern=cleanup.test
```
Expected: PASS.

- [ ] **Step 5: Wire into `backend/src/index.ts`**

Import and call on startup:
```typescript
import { startCleanupScheduler } from './services/cleanup';
// in buildApp() or after server starts:
startCleanupScheduler(db);
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/cleanup.ts backend/src/services/cleanup.test.ts backend/src/index.ts
git commit -m "feat: TTL cleanup service — delete files and DB rows for expired jobs every hour"
```

---

## Task 6: End-to-end verification

- [ ] **Run full test suite**

```bash
cd backend && npm test
```
Expected: all tests pass, no regressions.

- [ ] **Manual smoke test (local docker or direct node)**

1. Open app in browser A — upload a file, confirm job appears
2. Open app in browser B (different `localStorage`, e.g. incognito) — confirm job list is empty
3. Try to hit `GET /api/jobs/<job-id-from-A>` from B's session — expect 404
4. Try to convert same job twice simultaneously — expect 409 on second request
5. Manually set a job's `expires_at` to the past in sqlite, wait for cleanup or restart server — confirm job deleted

- [ ] **Push and deploy**

```bash
git push
```

CI builds and deploys. After deploy, verify no regressions on the live instance.

---

## Notes

- **Watch-folder jobs** have `session_id = NULL` and are invisible via the API. They exist purely for the watcher/notifier pipeline. No change needed to `watcher.ts`.
- **JobsPage.tsx** already calls `api.getJobs()` which will now return only the session's jobs — no frontend change needed.
- **`expires_at` on existing jobs** — the `ALTER TABLE` migration sets `DEFAULT (datetime('now', '+24 hours'))`, so all pre-migration jobs get a 24h grace period from migration time.
- **Future**: if you want users to keep jobs longer (e.g. premium tier), `expires_at` is already in the schema — just update the value at create time.
