import { Worker } from './worker';
import { JobQueue } from './job-queue';
import { initDb, createJob, getJob, updateJob } from '../db';
import type Database from 'better-sqlite3';
import type { Chapter, ProbeResult } from '../types';
import fs from 'fs';

// Mock service modules so no real ffmpeg or disk I/O is needed
jest.mock('../services/probe');
jest.mock('../services/converter');
jest.mock('../services/zipper');

import { probeFile } from '../services/probe';
import { convertChapters } from '../services/converter';
import { createZip } from '../services/zipper';

const mockProbeFile = probeFile as jest.MockedFunction<typeof probeFile>;
const mockConvertChapters = convertChapters as jest.MockedFunction<typeof convertChapters>;
const mockCreateZip = createZip as jest.MockedFunction<typeof createZip>;

const SAMPLE_CHAPTERS: Chapter[] = [
  { index: 0, title: 'Chapter 1', startTime: 0, endTime: 60, duration: 60 },
  { index: 1, title: 'Chapter 2', startTime: 60, endTime: 120, duration: 60 },
];

const SAMPLE_PROBE: ProbeResult = {
  chapters: SAMPLE_CHAPTERS,
  totalDuration: 120,
  totalSize: 1024 * 1024,
  originalBitrate: 128,
  hasDRM: false,
  audioCodec: 'aac',
  recommendedCodec: 'aac',
};

describe('Worker', () => {
  let db: Database.Database;
  let queue: JobQueue;
  let worker: Worker;

  // Spies for fs methods used inside worker (output size calculation)
  let mkdirSyncSpy: jest.SpyInstance;
  let readdirSyncSpy: jest.SpyInstance;
  let statSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    db = initDb(':memory:');
    queue = new JobQueue();
    worker = new Worker(db, queue);

    // Default happy-path mocks
    mockProbeFile.mockResolvedValue(SAMPLE_PROBE);
    mockConvertChapters.mockResolvedValue(['/data/output/job1/001 - Chapter 1.m4a']);
    mockCreateZip.mockResolvedValue(undefined);

    // Spy on fs methods the worker calls directly (mkdir, readdir, stat)
    mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readdirSyncSpy = jest.spyOn(fs, 'readdirSync').mockReturnValue(['001 - Chapter 1.m4a'] as any);
    statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000, isFile: () => true } as unknown as fs.Stats);
  });

  afterEach(() => {
    worker.stop();
    db.close();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('cancelCurrent()', () => {
    it('returns false when no job is active', () => {
      expect(worker.cancelCurrent()).toBe(false);
    });
  });

  describe('processJob status transitions', () => {
    it('transitions through probing → processing → complete', async () => {
      const job = createJob(db, {
        id: 'job-transitions',
        filename: 'test.m4b',
        uploadPath: '/uploads/test.m4b',
      });

      // Capture DB state during each async step
      const states: string[] = [];

      mockProbeFile.mockImplementation(async () => {
        states.push(getJob(db, job.id)!.status);
        return SAMPLE_PROBE;
      });

      mockConvertChapters.mockImplementation(async () => {
        states.push(getJob(db, job.id)!.status);
        return [];
      });

      mockCreateZip.mockImplementation(async () => {
        states.push(getJob(db, job.id)!.status);
      });

      queue.enqueue(job.id);

      await new Promise<void>((resolve) => {
        worker.on('job-complete', () => resolve());
        worker.on('job-error', () => resolve());
        worker.start();
      });

      worker.stop();

      // probeFile called while status=probing, convertChapters while status=processing
      expect(states[0]).toBe('probing');
      expect(states[1]).toBe('processing');

      const finalJob = getJob(db, job.id)!;
      expect(finalJob.status).toBe('complete');
    });

    it('sets status to error on conversion failure', async () => {
      const job = createJob(db, {
        id: 'job-fail',
        filename: 'test.m4b',
        uploadPath: '/uploads/test.m4b',
      });

      mockConvertChapters.mockRejectedValue(new Error('ffmpeg died'));

      queue.enqueue(job.id);

      await new Promise<void>((resolve) => {
        worker.on('job-complete', () => resolve());
        worker.on('job-error', () => resolve());
        worker.start();
      });

      worker.stop();

      const finalJob = getJob(db, job.id)!;
      expect(finalJob.status).toBe('error');
      expect(finalJob.errorMessage).toBe('ffmpeg died');
    });

    it('sets status to cancelled when conversion is aborted', async () => {
      const job = createJob(db, {
        id: 'job-cancel',
        filename: 'test.m4b',
        uploadPath: '/uploads/test.m4b',
      });

      mockConvertChapters.mockRejectedValue(new Error('Conversion cancelled'));

      queue.enqueue(job.id);

      await new Promise<void>((resolve) => {
        worker.on('job-complete', () => resolve());
        worker.on('job-error', () => resolve());
        worker.start();
      });

      worker.stop();

      const finalJob = getJob(db, job.id)!;
      expect(finalJob.status).toBe('cancelled');
      expect(finalJob.errorMessage).toBeUndefined();
    });
  });

  describe('full job completion', () => {
    it('processes a job end-to-end and emits job-complete', async () => {
      const job = createJob(db, {
        id: 'job-e2e',
        filename: 'audiobook.m4b',
        uploadPath: '/uploads/audiobook.m4b',
      });

      queue.enqueue(job.id);

      const result = await new Promise<{ jobId: string; zipPath: string }>((resolve, reject) => {
        worker.on('job-complete', resolve);
        worker.on('job-error', (e: { error: string }) => reject(new Error(e.error)));
        worker.start();
      });

      worker.stop();

      expect(result.jobId).toBe(job.id);
      expect(mockProbeFile).toHaveBeenCalledWith(job.uploadPath);
      expect(mockConvertChapters).toHaveBeenCalled();
      expect(mockCreateZip).toHaveBeenCalled();

      const finalJob = getJob(db, job.id)!;
      expect(finalJob.status).toBe('complete');
      expect(finalJob.zipPath).toBeDefined();
    });

    it('skips probing when chapters are already set on the job', async () => {
      const job = createJob(db, {
        id: 'job-no-probe',
        filename: 'pre-probed.m4b',
        uploadPath: '/uploads/pre-probed.m4b',
      });

      // Pre-populate chapters in the DB so the worker skips probing
      updateJob(db, job.id, {
        chapters: SAMPLE_CHAPTERS,
        chapterCount: SAMPLE_CHAPTERS.length,
        totalDuration: 120,
        totalSize: 1024,
      });

      queue.enqueue(job.id);

      await new Promise<void>((resolve) => {
        worker.on('job-complete', () => resolve());
        worker.on('job-error', () => resolve());
        worker.start();
      });

      worker.stop();

      expect(mockProbeFile).not.toHaveBeenCalled();
      expect(getJob(db, job.id)!.status).toBe('complete');
    });
  });
});
