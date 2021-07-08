import path from 'path';
import { makeErr, Result } from './lang';

export interface DataDir {
  kind: 'DataDir';
  value: string;
}

export function makeDataDir(inputPath?: string): Result<DataDir> {
  if (!inputPath) {
    return makeErr('Missing value');
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);

  return {
    kind: 'DataDir',
    value: absolutePath,
  };
}

export function isDataDir(value: any): value is DataDir {
  return value.kind === 'DataDir';
}
