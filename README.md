# yoto-splitter

Web UI for splitting M4B audiobooks into AAC chapters for Yoto MYO cards.

## Features
- Upload M4B audiobooks and preview chapter list
- Compare estimated output sizes at different bitrates (32k–128k AAC)
- Test-encode a single chapter to verify actual file size
- Convert to AAC chapters with per-chapter progress tracking
- Download all chapters as a zip file
- Watch folder: auto-convert dropped .m4b files with ntfy notifications
- Basic auth support

## Quick Start
```bash
cp .env.example .env
# Edit .env as needed
docker compose up -d
```

Open http://localhost:3001

## Environment Variables
See `.env.example` for all options.

## Development
```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```


## Public Repository

This project is now available on GitHub: https://github.com/janspants11/yoto-splitter

[![GitHub stars](https://img.shields.io/github/stars/janspants11/yoto-splitter?style=social)](https://github.com/janspants11/yoto-splitter)
[![Docker Pulls](https://img.shields.io/docker/pulls/username/yoto-splitter-backend)](https://hub.docker.com/r/username/yoto-splitter-backend)
