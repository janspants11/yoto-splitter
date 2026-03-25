# Agent Instructions

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file
rm -rf directory            # NOT: rm -r directory
```

## Project Overview

**yoto-splitter** — Web UI for splitting M4B audiobooks into AAC chapters for Yoto MYO cards.

- **Frontend**: React + Vite + Tailwind, served via nginx on port 3001 (host) / 80 (container)
- **Backend**: Node.js + Express + ffmpeg on port 4001 (host) / 4000 (container)
- **CI**: GitHub Actions or similar CI/CD system

## Key Paths

| Path | Purpose |
|------|---------|
| `backend/` | Node.js API, ffmpeg processing, job queue (better-queue), SQLite |
| `frontend/` | React SPA |
| `docker-compose.yml` | Production stack |
| `.env.example` | Environment variable template |
| `.github/workflows/build-and-publish.yml` | CI/CD pipeline |

## Volumes

- `yoto-data` — named volume mounted at `/data` in backend (jobs DB, output files)
- `${WATCH_DIR:-./watch}` — bind mount to `/data/watch` for watch folder feature

## Environment Variables

See `.env.example`. Key vars: `AUTH_MODE`, `WATCH_DIR`, `WATCH_BITRATE`, `NTFY_URL`, `NTFY_TOPIC`.

## Frontend Testing — playwright-cli

Use `playwright-cli` to validate frontend changes against your local development server.

**Always run playwright-cli validation after making frontend changes before committing.**

```bash
# Open a named session, navigate, and snapshot
playwright-cli -s=yoto open
playwright-cli -s=yoto goto http://localhost:3002
playwright-cli -s=yoto snapshot

# Navigate to jobs history page
playwright-cli -s=yoto goto http://localhost:3002/jobs
playwright-cli -s=yoto snapshot

# Take a screenshot for visual verification
playwright-cli -s=yoto screenshot --filename=screenshot.png

# Close when done
playwright-cli close-all
```

The skills can be installed to `.claude/skills/playwright-cli` by running:
```bash
playwright-cli install --skills
```

Sessions are isolated by default. Use `-s=<name>` to reuse a named session across multiple commands.
