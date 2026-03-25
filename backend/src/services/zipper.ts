import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

export async function createZip(inputDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 0 } });

    output.on('close', () => resolve());
    output.on('error', (err) => reject(err));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    // Add all files from inputDir (non-recursive, flat)
    const files = fs.readdirSync(inputDir);
    for (const file of files) {
      const filePath = path.join(inputDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        archive.file(filePath, { name: file });
      }
    }

    archive.finalize();
  });
}
