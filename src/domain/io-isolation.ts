import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

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

export type RmdirRecursivelyFn = typeof rmdirRecursively;

export function rmdirRecursively(path: string): void {
  rmdirSync(path, { recursive: true });
}

export type WriteFileFn = (path: string, content: string) => void;

export function writeFile(path: string, content: string): void {
  writeFileSync(path, content, { encoding: 'utf8' });
}

export type DeleteFileFn = (path: string) => void;

export function deleteFile(path: string): void {
  rmSync(path);
}

export type RenameFileFn = (oldPath: string, newPath: string) => void;

export function renameFile(oldPath: string, newPath: string): void {
  renameSync(oldPath, newPath);
}

export type ListFilesFn = (path: string) => string[];

export function listFiles(dirPath: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

export type ListDirectoriesFn = (path: string) => string[];

export function listDirectories(dirPath: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

export type StdOutPrinterFn = (message: string) => void;

export function stdOutPrinter(message: string): void {
  console.log(message);
}

export type TimestampFn = () => string;

export function timestamp(): string {
  return new Date().toJSON();
}
