import path from 'path';

export function getFirstCliArg(process: NodeJS.Process): string | undefined {
  return process.argv[2];
}

export function getSecondCliArg(process: NodeJS.Process): string | undefined {
  return process.argv[3];
}

export function programFilePath(process: NodeJS.Process): string {
  return path.relative(process.cwd(), process.argv[1]!);
}

export function isRunDirectly(module: NodeJS.Module): boolean {
  return require.main === module;
}
