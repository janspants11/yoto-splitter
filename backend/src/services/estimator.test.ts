import { estimateSizes, estimateAtBitrate } from './estimator';

describe('estimateSizes', () => {
  it('returns estimates for all 5 preset bitrates', () => {
    const results = estimateSizes(3600);
    expect(results).toHaveLength(5);
    expect(results.map(r => r.bitrate)).toEqual([32, 48, 64, 96, 128]);
  });

  it('calculates correct size for 1 hour at 48kbps', () => {
    const results = estimateSizes(3600);
    const at48 = results.find(r => r.bitrate === 48)!;
    // 3600 * 48 * 1000 / 8 = 21,600,000 bytes raw
    // * 1.05 overhead = 22,680,000 bytes
    expect(at48.estimatedBytes).toBe(22680000);
    // 22,680,000 / 1,048,576 = ~21.6 MB
    expect(at48.estimatedMB).toBe(21.6);
    expect(at48.fitsYoto).toBe(true);
  });

  it('calculates correct size for 1 hour at 128kbps', () => {
    const results = estimateSizes(3600);
    const at128 = results.find(r => r.bitrate === 128)!;
    // 3600 * 128 * 1000 / 8 = 57,600,000 bytes raw
    // * 1.05 = 60,480,000
    expect(at128.estimatedBytes).toBe(60480000);
    expect(at128.fitsYoto).toBe(true);
  });

  it('marks fitsYoto false when estimate exceeds 500MB', () => {
    // At 128kbps, need duration where size > 500MB
    // 500 * 1024 * 1024 = 524,288,000 bytes
    // 524,288,000 / 1.05 / (128 * 1000 / 8) = ~31,207 seconds
    // So 32,000 seconds at 128kbps should exceed 500MB
    const results = estimateSizes(32000);
    const at128 = results.find(r => r.bitrate === 128)!;
    expect(at128.fitsYoto).toBe(false);
  });

  it('short audiobook fits at all bitrates', () => {
    const results = estimateSizes(600); // 10 minutes
    expect(results.every(r => r.fitsYoto)).toBe(true);
  });
});

describe('estimateAtBitrate', () => {
  it('returns correct estimate for a specific bitrate', () => {
    const result = estimateAtBitrate(3600, 48);
    expect(result.bitrate).toBe(48);
    expect(result.estimatedBytes).toBe(22680000);
    expect(result.fitsYoto).toBe(true);
  });

  it('works with non-preset bitrates', () => {
    const result = estimateAtBitrate(3600, 56);
    // 3600 * 56 * 1000 / 8 * 1.05 = 26,460,000
    expect(result.estimatedBytes).toBe(26460000);
  });

  it('handles zero duration', () => {
    const result = estimateAtBitrate(0, 48);
    expect(result.estimatedBytes).toBe(0);
    expect(result.estimatedMB).toBe(0);
    expect(result.fitsYoto).toBe(true);
  });
});
