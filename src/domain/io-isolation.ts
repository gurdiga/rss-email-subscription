import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { si } from '../shared/string-utils';

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
  rmSync(path, { recursive: true });
}

export type WriteFileFn = (path: string, content: string) => void;

// Write beside the target, then rename over it: a rename within one directory is
// atomic, so a crash mid-write or a reader in another container (api, app and delmon
// share the data tree) never sees a half-written file. listFiles hides the temporary.
// Its name is random rather than PID-based: each container numbers its own PIDs, so
// two of them writing the same file could otherwise share one temporary.
export function writeFile(path: string, content: string): void {
  const tempPath = si`${path}.${randomBytes(6).toString('hex')}${tempFileSuffix}`;

  writeFileSync(tempPath, content, { encoding: 'utf8' });
  renameSync(tempPath, path);
}

const tempFileSuffix = '.tmp';

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
    .filter((e) => e.isFile() && !e.name.endsWith(tempFileSuffix))
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
