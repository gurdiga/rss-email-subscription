import path from 'path';
import { makeErr, Result } from './lang';

export interface DataDir {
  kind: 'DataDir';
  value: string;
}

export function makeDataDir(inputPath?: string, dataDirRoot = process.cwd()): Result<DataDir> {
  if (!inputPath) {
    return makeErr('Missing value');
  }

  const absolutePath = path.resolve(dataDirRoot, inputPath);

  return {
    kind: 'DataDir',
    value: absolutePath,
  };
}
