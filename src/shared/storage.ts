import { writeFile } from 'node:fs/promises';

export async function storeItem(
  key: string,
  value: any,
  dataDirRoot: string = process.env['DATA_DIR_ROOT']!
): Promise<void> {
  return writeFile(`${dataDirRoot}/${key}`, JSON.stringify(value));
}
