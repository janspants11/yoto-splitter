import type { SizeEstimate } from '../types';

const YOTO_MAX_BYTES = 500 * 1024 * 1024; // 500MB
const CONTAINER_OVERHEAD = 1.05; // 5% for AAC container headers
const PRESET_BITRATES = [32, 48, 64, 96, 128]; // kbps

export function estimateSizes(durationSeconds: number): SizeEstimate[] {
  return PRESET_BITRATES.map(bitrate => {
    const estimatedBytes = Math.round((durationSeconds * bitrate * 1000 / 8) * CONTAINER_OVERHEAD);
    return {
      bitrate,
      estimatedBytes,
      estimatedMB: Math.round(estimatedBytes / (1024 * 1024) * 10) / 10,
      fitsYoto: estimatedBytes < YOTO_MAX_BYTES,
    };
  });
}

export function estimateAtBitrate(durationSeconds: number, bitrate: number): SizeEstimate {
  const estimatedBytes = Math.round((durationSeconds * bitrate * 1000 / 8) * CONTAINER_OVERHEAD);
  return {
    bitrate,
    estimatedBytes,
    estimatedMB: Math.round(estimatedBytes / (1024 * 1024) * 10) / 10,
    fitsYoto: estimatedBytes < YOTO_MAX_BYTES,
  };
}
