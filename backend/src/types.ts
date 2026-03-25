export type JobStatus = 'pending' | 'probing' | 'ready' | 'queued' | 'processing' | 'complete' | 'error' | 'cancelled';
export type JobSource = 'upload' | 'watch';

export interface Chapter {
  index: number;
  title: string;
  startTime: number;  // seconds (float)
  endTime: number;    // seconds (float)
  duration: number;   // seconds (float)
}

export interface ProbeResult {
  chapters: Chapter[];
  totalDuration: number;   // seconds
  totalSize: number;       // bytes
  originalBitrate: number; // kbps
  hasDRM: boolean;
  audioCodec: string;
  recommendedCodec: 'aac' | 'libmp3lame';
}

export interface SizeEstimate {
  bitrate: number;  // kbps
  estimatedBytes: number;
  estimatedMB: number;
  fitsYoto: boolean;  // under 500MB
}

export interface Job {
  id: string;
  filename: string;
  uploadPath: string;
  outputDir?: string;
  zipPath?: string;
  status: JobStatus;
  bitrate?: number;  // kbps, set when user initiates conversion
  codec?: 'aac' | 'libmp3lame';  // output codec, set when user initiates conversion
  totalDuration?: number;
  totalSize?: number;
  outputSize?: number;
  chapterCount?: number;
  chapters?: Chapter[];
  errorMessage?: string;
  source: JobSource;
  sessionId?: string;   // undefined for watch-sourced jobs
  expiresAt: string;    // ISO datetime
  createdAt: string;
  updatedAt: string;
}
