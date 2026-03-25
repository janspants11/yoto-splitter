import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import type { Chapter, ProbeResult } from '../types';
import { sanitizeTitle } from '../utils/sanitize';

const execFileAsync = promisify(execFile);

interface FfprobeChapter {
  id: number;
  start_time: string;
  end_time: string;
  tags?: { title?: string };
}

interface FfprobeFormat {
  duration: string;
  size: string;
  bit_rate: string;
}

interface FfprobeOutput {
  chapters?: FfprobeChapter[];
  format: FfprobeFormat;
}

export async function probeFile(filePath: string): Promise<ProbeResult> {
  // Verify file exists (throws if not)
  await fs.promises.access(filePath);

  const { stdout } = await execFileAsync('ffprobe', [
    '-i', filePath,
    '-print_format', 'json',
    '-show_chapters',
    '-show_format',
    '-loglevel', 'quiet',
  ]);

  let data: FfprobeOutput;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse ffprobe output for: ${filePath}`);
  }

  const totalDuration = parseFloat(data.format.duration);
  const totalSize = parseInt(data.format.size, 10);
  const originalBitrate = Math.round(parseInt(data.format.bit_rate, 10) / 1000);

  if (isNaN(totalDuration) || isNaN(totalSize) || isNaN(originalBitrate)) {
    throw new Error(`ffprobe returned unparseable format data for: ${filePath}`);
  }

  let chapters: Chapter[];

  if (data.chapters && data.chapters.length > 0) {
    chapters = data.chapters.map((ch, i) => {
      const startTime = parseFloat(ch.start_time);
      const endTime = parseFloat(ch.end_time);
      const rawTitle = ch.tags?.title ?? `chapter_${i.toString().padStart(3, '0')}`;
      const title = sanitizeTitle(rawTitle) || `chapter_${i.toString().padStart(3, '0')}`;
      return {
        index: i,
        title,
        startTime,
        endTime,
        duration: endTime - startTime,
      };
    });
  } else {
    chapters = [{
      index: 0,
      title: 'Full Book',
      startTime: 0,
      endTime: totalDuration,
      duration: totalDuration,
    }];
  }

  return { chapters, totalDuration, totalSize, originalBitrate };
}
