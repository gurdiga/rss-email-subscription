import { dirname, join } from 'node:path';
import { fileExists, FileExistsFn, mkdirp, MkdirpFn, writeFile, WriteFileFn } from './io';
import { getErrorMessage, makeErr, Result } from './lang';

export function storeItem(
  key: string,
  value: any,
  dataDirRoot: string = process.env['DATA_DIR_ROOT']!,
  mkdirpFn: MkdirpFn = mkdirp,
  writeFileFn: WriteFileFn = writeFile,
  fileExistsFn: FileExistsFn = fileExists
): Result<true> {
  const filePath = join(dataDirRoot, key);
  const dirPath = dirname(filePath);

  if (!fileExistsFn(dirPath)) {
    try {
      mkdirpFn(dirPath);
    } catch (error) {
      return makeErr(getErrorMessage(error));
    }
  }

  try {
    writeFileFn(filePath, JSON.stringify(value));
  } catch (error) {
    return makeErr(getErrorMessage(error));
  }

  return true;
}
