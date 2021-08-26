import path from 'path';

export interface Args<T> {
  kind: 'Args';
  values: T;
}

export function getFirstCliArg(process: NodeJS.Process): string {
  return process.argv[2];
}

export function programFilePath(process: NodeJS.Process): string {
  return path.relative(process.cwd(), process.argv[1]);
}

export function isRunDirectly(module: NodeJS.Module): boolean {
  return require.main === module;
}
