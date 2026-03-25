import { probeFile } from './probe';

describe('probe module', () => {
  it('exports probeFile function', () => {
    expect(typeof probeFile).toBe('function');
  });

  it('rejects on non-existent file', async () => {
    await expect(probeFile('/tmp/nonexistent_file_abc123.m4b')).rejects.toThrow();
  });
});
