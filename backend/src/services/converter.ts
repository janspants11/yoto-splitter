import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import type { Chapter } from '../types';
import { sanitizeTitle } from '../utils/sanitize';
import { detectAudioInfo, type AudioCodec } from './probe';

export interface ConvertOptions {
  inputPath: string;
  chapters: Chapter[];
  bitrate: number;  // kbps
  outputDir: string;
  signal?: AbortSignal;
  audioCodec?: AudioCodec;  // optional override, auto-detected if not specified
}

export interface ChapterProgress {
  chapterIndex: number;
  chapterTitle: string;
  percent: number;  // 0-100 within this chapter
}

export interface ConvertCallbacks {
  onChapterStart?: (index: number, title: string) => void;
  onChapterProgress?: (progress: ChapterProgress) => void;
  onChapterComplete?: (index: number, outputPath: string, sizeBytes: number) => void;
  onError?: (index: number, error: Error) => void;
}

/** Convert ffmpeg timemark "HH:MM:SS.ss" to seconds. */
function timemarkToSeconds(timemark: string): number {
  if (!timemark) return 0;
  const parts = timemark.split(':');
  if (parts.length !== 3) return 0;
  return (
    parseInt(parts[0], 10) * 3600 +
    parseInt(parts[1], 10) * 60 +
    parseFloat(parts[2])
  );
}

export async function convertChapters(
  options: ConvertOptions,
  callbacks: ConvertCallbacks = {}
): Promise<string[]> {
  const { inputPath, chapters, bitrate, outputDir, signal } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  // Auto-detect best codec if not explicitly specified
  let audioCodec = options.audioCodec;
  let hasDRM = false;
  if (!audioCodec) {
    try {
      const audioInfo = await detectAudioInfo(inputPath);
      audioCodec = audioInfo.recommendedCodec;
      hasDRM = audioInfo.hasDRM;
      // eslint-disable-next-line no-console
      console.error(`[converter] Detected codec: ${audioInfo.codec}, DRM: ${hasDRM}, using: ${audioCodec}`);
    } catch (err) {
      // If detection fails, default to MP3 (safer fallback)
      audioCodec = 'libmp3lame';
      // eslint-disable-next-line no-console
      console.error(`[converter] Failed to detect audio info, defaulting to MP3: ${err}`);
    }
  }

  const outputPaths: string[] = [];

  for (const chapter of chapters) {
    const paddedIndex = (chapter.index + 1).toString().padStart(3, '0');
    const safeTitle = sanitizeTitle(chapter.title);
    // Use file extension based on selected codec
    const fileExtension = audioCodec === 'aac' ? 'mp4' : 'mp3';
    const outputFilename = `${paddedIndex} - ${safeTitle}.${fileExtension}`;
    const outputPath = path.join(outputDir, outputFilename);

    callbacks.onChapterStart?.(chapter.index, chapter.title);

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .inputOptions([
          `-ss`, String(chapter.startTime),
        ])
        .outputOptions([
          // Always overwrite output files to avoid ffmpeg prompting on existing files
          '-y',
          // Enable verbose logging to diagnose encoding failures
          '-loglevel', 'verbose',
          '-vn',
          // Dynamically select codec based on DRM detection
          '-codec:a', audioCodec,
          `-b:a`, `${bitrate}k`,
          '-ac', '1',
          '-t', String(chapter.duration),
        ])
        .output(outputPath)
        // Log ffmpeg stderr lines to help diagnose hangs/errors in deployed environments
        .on('stderr', (line) => {
          // Keep the message concise so logs are useful without being noisy
          // eslint-disable-next-line no-console
          console.error(`[ffmpeg] ${line}`);
        })
        .on('progress', (p) => {
          // p.percent is relative to the full input file duration, not this chapter.
          // Derive within-chapter percent from timemark instead.
          const encodedSeconds = timemarkToSeconds(p.timemark);
          const chapterPercent = chapter.duration > 0
            ? Math.min(100, Math.round((encodedSeconds / chapter.duration) * 100))
            : 0;
          callbacks.onChapterProgress?.({
            chapterIndex: chapter.index,
            chapterTitle: chapter.title,
            percent: chapterPercent,
          });
        })
        .on('end', () => {
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          clearTimeout(timeoutHandle);
          resolve();
        })
        .on('error', (err) => {
          callbacks.onError?.(chapter.index, err as Error);
          clearTimeout(timeoutHandle);
          reject(err);
        });

      // Set a timeout to detect hanging processes
      // Each chapter could be large, use generous 30min timeout per chapter
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`ffmpeg encoding timed out after 30 minutes for chapter ${chapter.index}`));
        try {
          command.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 30 * 60 * 1000);

      let onAbort: () => void;

      if (signal) {
        onAbort = () => {
          command.kill('SIGKILL');
          clearTimeout(timeoutHandle);
          reject(new Error('Conversion cancelled'));
        };
        if (signal.aborted) {
          clearTimeout(timeoutHandle);
          reject(new Error('Conversion cancelled'));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      command.run();
    });

    let stats: fs.Stats;
    try {
      stats = fs.statSync(outputPath);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError?.(chapter.index, error);
      throw error;
    }
    callbacks.onChapterComplete?.(chapter.index, outputPath, stats.size);
    outputPaths.push(outputPath);
  }

  return outputPaths;
}
