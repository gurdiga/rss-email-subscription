import path from 'path';

export interface ValidDataDir {
  kind: 'ValidDataDir';
  value: string;
}

export interface InvalidDataDir {
  kind: 'InvalidDataDir';
  reason: string;
}

export function makeDataDir(inputPath?: string): ValidDataDir | InvalidDataDir {
  if (!inputPath) {
    return {
      kind: 'InvalidDataDir',
      reason: 'Missing value',
    };
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);

  return {
    kind: 'ValidDataDir',
    value: absolutePath,
  };
}
