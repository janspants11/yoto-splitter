import { createZip } from './zipper';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('createZip', () => {
  it('is a function with correct arity', () => {
    expect(typeof createZip).toBe('function');
    expect(createZip.length).toBe(2);
  });

  it('creates a valid zip from a directory of files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipper-test-'));
    const inputDir = path.join(tmpDir, 'input');
    const outputPath = path.join(tmpDir, 'output.zip');

    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'file1.txt'), 'hello');
    fs.writeFileSync(path.join(inputDir, 'file2.txt'), 'world');

    await createZip(inputDir, outputPath);

    // Verify zip file was created and has non-zero size
    const stat = fs.statSync(outputPath);
    expect(stat.size).toBeGreaterThan(0);

    // Verify it starts with PK zip magic bytes
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(outputPath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a zip even with empty directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipper-empty-'));
    const inputDir = path.join(tmpDir, 'input');
    const outputPath = path.join(tmpDir, 'output.zip');

    fs.mkdirSync(inputDir, { recursive: true });

    await createZip(inputDir, outputPath);

    const stat = fs.statSync(outputPath);
    expect(stat.size).toBeGreaterThan(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
