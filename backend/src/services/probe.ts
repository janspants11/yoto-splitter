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

interface FfprobeStream {
  codec_type: string;
  codec_name?: string;
  tags?: { [key: string]: string };
}

interface FfprobeFormat {
  duration: string;
  size: string;
  bit_rate: string;
  tags?: { [key: string]: string };
}

interface FfprobeOutput {
  chapters?: FfprobeChapter[];
  streams?: FfprobeStream[];
  format: FfprobeFormat;
}

export type AudioCodec = 'aac' | 'libmp3lame';

export interface AudioInfo {
  codec: string;
  hasDRM: boolean;
  recommendedCodec: AudioCodec;
}

export async function probeFile(filePath: string): Promise<ProbeResult> {
  // Verify file exists (throws if not)
  await fs.promises.access(filePath);

  const { stdout } = await execFileAsync('ffprobe', [
    '-i', filePath,
    '-print_format', 'json',
    '-show_chapters',
    '-show_format',
    '-show_streams',
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

/** Detect audio codec and DRM protection from file metadata */
export async function detectAudioInfo(filePath: string): Promise<AudioInfo> {
  await fs.promises.access(filePath);

  const { stdout } = await execFileAsync('ffprobe', [
    '-i', filePath,
    '-print_format', 'json',
    '-show_streams',
    '-loglevel', 'quiet',
  ]);

  let data: FfprobeOutput;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse ffprobe output for: ${filePath}`);
  }

  // Find audio stream
  const audioStream = data.streams?.find(s => s.codec_type === 'audio');
  if (!audioStream) {
    throw new Error(`No audio stream found in: ${filePath}`);
  }

  const codec = audioStream.codec_name || 'unknown';

  // Detect DRM protection markers
  const hasDRM = detectDRM(data);

  // Recommend codec based on detection
  const recommendedCodec = hasDRM ? 'libmp3lame' : 'aac';

  return { codec, hasDRM, recommendedCodec };
}

/** Check for DRM markers in file metadata */
function detectDRM(data: FfprobeOutput): boolean {
  // Check format-level tags for DRM indicators (Audible, etc)
  const formatTags = data.format.tags ?? {};
  const drmIndicators = [
    'AUDIBLE_DRM_TYPE',
    'AUDIBLE_ACR',
    'DRM',
    'PROTECTED',
  ];

  for (const indicator of drmIndicators) {
    if (indicator in formatTags) {
      return true;
    }
  }

  // Check stream-level tags for DRM indicators
  const audioStream = data.streams?.find(s => s.codec_type === 'audio');
  if (audioStream?.tags) {
    for (const indicator of drmIndicators) {
      if (indicator in audioStream.tags) {
        return true;
      }
    }
  }

  // Check for specific codec issues with certain formats
  // (e.g., mp4a codec with certain containers often indicates DRM-wrapped audio)
  if (audioStream?.codec_name === 'aac' && data.format.tags?.AUDIBLE_ASIN) {
    return true;
  }

  return false;
}
