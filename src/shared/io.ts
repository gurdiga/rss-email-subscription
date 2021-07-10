import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';

export type ReadFileFn = (filePath: string) => string;

export function readFile(path: string) {
  return readFileSync(path, 'utf8');
}

export type FileExistsFn = (filePath: string) => boolean;

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export type MkdirpFn = (path: string) => void;

export function mkdirp(path: string): void {
  mkdirSync(path, { recursive: true });
}

export type WriteFileFn = (path: string, content: string) => void;

export function writeFile(path: string, content: string): void {
  writeFileSync(path, content, { encoding: 'utf8' });
}

export type ListFilesFn = (path: string) => string[];

export function listFiles(dirPath: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}
