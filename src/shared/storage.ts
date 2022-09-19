import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileExists } from './io';

export async function storeItem(
  key: string,
  value: any,
  dataDirRoot: string = process.env['DATA_DIR_ROOT']!
): Promise<void> {
  const filePath = join(dataDirRoot, key);
  const dirPath = dirname(filePath);

  if (!fileExists(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }

  return writeFile(filePath, JSON.stringify(value));
}
