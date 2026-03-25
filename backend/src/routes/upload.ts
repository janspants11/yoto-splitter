import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { createJob, updateJob } from '../db';
import { probeFile } from '../services/probe';
import { estimateSizes } from '../services/estimator';

export function createUploadRouter(db: Database.Database) {
  const router = Router();

  const dataDir = process.env.DATA_DIR ?? '/data';
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, _file, cb) => cb(null, `${uuid()}.m4b`),
  });

  const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.m4b') {
      return cb(new Error('Only .m4b files are allowed'));
    }
    cb(null, true);
  };

  const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

  router.post('/', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const jobId = path.basename(req.file.filename, '.m4b');
      const uploadPath = req.file.path;
      const originalName = req.file.originalname;

      // Validate magic bytes: MP4/M4B containers have 'ftyp' at bytes 4-7
      const buf = Buffer.alloc(12);
      const fd = fs.openSync(uploadPath, 'r');
      fs.readSync(fd, buf, 0, 12, 0);
      fs.closeSync(fd);
      const isMp4Container = buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
      if (!isMp4Container) {
        fs.unlinkSync(uploadPath);
        return res.status(400).json({ error: 'File does not appear to be a valid M4B audiobook' });
      }

      // Create job in DB
      createJob(db, { id: jobId, filename: originalName, uploadPath, sessionId: req.sessionId });

      // Probe the file
      updateJob(db, jobId, { status: 'probing' });

      let probeResult;
      try {
        probeResult = await probeFile(uploadPath);
      } catch (err) {
        updateJob(db, jobId, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        if (req.file?.path) {
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        }
        return res.status(500).json({
          error: 'Failed to probe file',
          details: err instanceof Error ? err.message : String(err),
        });
      }

      // Update DB with chapter data
      updateJob(db, jobId, {
        chapters: probeResult.chapters,
        chapterCount: probeResult.chapters.length,
        totalDuration: probeResult.totalDuration,
        totalSize: probeResult.totalSize,
        status: 'ready',
      });

      // Calculate size estimates
      const estimates = estimateSizes(probeResult.totalDuration);

      return res.json({
        jobId,
        filename: originalName,
        chapters: probeResult.chapters,
        format: {
          totalDuration: probeResult.totalDuration,
          totalSize: probeResult.totalSize,
          originalBitrate: probeResult.originalBitrate,
        },
        audio: {
          codec: probeResult.audioCodec,
          hasDRM: probeResult.hasDRM,
          recommendedCodec: probeResult.recommendedCodec,
        },
        estimates,
      });
    } catch (err) {
      return res.status(500).json({
        error: 'Upload failed',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Multer error handler
  router.use((err: Error, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => {
    if (err instanceof multer.MulterError) {
      return res.status(413).json({ error: err.message });
    }
    if (err instanceof Error && err.message === 'Only .m4b files are allowed') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Upload failed' });
  });

  return router;
}
