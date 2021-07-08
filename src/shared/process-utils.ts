import path from 'path';

export interface Args<T> {
  kind: 'Args';
  values: T;
}

export function getFirstCliArg(process: NodeJS.Process): string {
  return process.argv[2];
}

export function getSecondCliArg(process: NodeJS.Process): string {
  return process.argv[3];
}

export function programFilePath(process: NodeJS.Process): string {
  return path.relative(process.cwd(), process.argv[1]);
}
