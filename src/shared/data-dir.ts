import path from 'path';
import { Result } from './lang';

export interface DataDir {
  kind: 'DataDir';
  value: string;
}

export function makeDataDir(inputPath?: string): Result<DataDir> {
  if (!inputPath) {
    return {
      kind: 'Err',
      reason: 'Missing value',
    };
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);

  return {
    kind: 'DataDir',
    value: absolutePath,
  };
}
