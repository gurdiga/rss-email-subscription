import { dirname, join } from 'node:path';
import { Result, attempt, isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  DeleteFileFn,
  FileExistsFn,
  ListDirectoriesFn,
  ListFilesFn,
  MkdirpFn,
  ReadFileFn,
  RenameFileFn,
  RmdirRecursivelyFn,
  WriteFileFn,
  deleteFile,
  fileExists,
  listDirectories,
  listFiles,
  mkdirp,
  readFile,
  renameFile,
  rmdirRecursively,
  writeFile,
} from './io-isolation';

export type StorageKey = string; // Something like this: '/accounts/219812984/account.json'
export type StorageValue = any; // Will get JSONified and stored in the file.

export interface AppStorage {
  storeItem: (
    key: StorageKey,
    value: StorageValue,
    mkdirpFn?: MkdirpFn,
    writeFileFn?: WriteFileFn,
    fileExistsFn?: FileExistsFn
  ) => Result<void>;

  loadItem: (key: StorageKey, readFileFn?: ReadFileFn) => Result<StorageValue>;
  hasItem: (key: StorageKey, fileExistsFn?: FileExistsFn) => Result<boolean>;
  removeItem: (key: StorageKey, deleteFileFn?: DeleteFileFn, fileExistsFn?: FileExistsFn) => Result<void>;
  renameItem: (
    oldKey: StorageKey,
    newKey: StorageKey,
    options?: { overwriteIfExists: boolean },
    renameFileFn?: RenameFileFn,
    fileExistsFn?: FileExistsFn
  ) => Result<void>;
  listItems: (key: StorageKey, listFilesFn?: ListFilesFn, fileExistsFn?: FileExistsFn) => Result<StorageKey[]>;

  listSubdirectories: (
    key: StorageKey,
    listDirectoriesFn?: ListDirectoriesFn,
    fileExistsFn?: FileExistsFn
  ) => Result<StorageKey[]>;
  removeTree: (key: StorageKey, rmdirFn?: RmdirRecursivelyFn, fileExistsFn?: FileExistsFn) => Result<void>;
}

export function makeStorage(dataDirRoot: string): AppStorage {
  function storeItem(
    key: StorageKey,
    value: StorageValue,
    mkdirpFn: MkdirpFn = mkdirp,
    writeFileFn: WriteFileFn = writeFile,
    fileExistsFn: FileExistsFn = fileExists
  ): Result<void> {
    const filePath = join(dataDirRoot, key);
    const dirPath = dirname(filePath);

    if (!fileExistsFn(dirPath)) {
      const mkdirpResult = attempt(() => mkdirpFn(dirPath));

      if (isErr(mkdirpResult)) {
        return makeErr(si`Failed to create storage directory structure: ${mkdirpResult.reason}`);
      }
    }

    const writeFileResult = attempt(() => writeFileFn(filePath, JSON.stringify(value, null, 2)));

    if (isErr(writeFileResult)) {
      return makeErr(si`Couldn’t write file: ${writeFileResult.reason}`);
    }
  }

  // TODO: Avoid returning 'any' by adding a ParseValueFn argument, like this:
  // type ParseValueFn<R> = (rawjson: unknown) => R;
  function loadItem(key: StorageKey, readFileFn: ReadFileFn = readFile): Result<StorageValue> {
    const filePath = join(dataDirRoot, key);
    const readFileResult = attempt(() => readFileFn(filePath));

    if (isErr(readFileResult)) {
      return makeErr(si`Failed to read file: ${readFileResult.reason}`);
    }

    const jsonParseResult = attempt(() => JSON.parse(readFileResult, jsonParseFilter));

    if (isErr(jsonParseResult)) {
      return makeErr(si`Failed to parse JSON at ${key}: ${jsonParseResult.reason}`);
    }

    return jsonParseResult;
  }

  function hasItem(key: StorageKey, fileExistsFn: FileExistsFn = fileExists): Result<boolean> {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(si`Failed to check file: ${fileExistsResult.reason}`);
    }

    return fileExistsResult;
  }

  function removeItem(
    key: StorageKey,
    deleteFileFn: DeleteFileFn = deleteFile,
    fileExistsFn: FileExistsFn = fileExists
  ): Result<void> {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(si`Failed to check file exists: ${fileExistsResult.reason}`);
    }

    if (fileExistsResult === false) {
      return;
    }

    const deleteFileResult = attempt(() => deleteFileFn(filePath));

    if (isErr(deleteFileResult)) {
      return makeErr(si`Failed to delete file: ${deleteFileResult.reason}`);
    }
  }

  function renameItem(
    oldKey: StorageKey,
    newKey: StorageKey,
    { overwriteIfExists } = { overwriteIfExists: false },
    renameFileFn = renameFile,
    fileExistsFn = fileExists,
    dirnameFn = dirname
  ): Result<void> {
    const oldPath = join(dataDirRoot, oldKey);
    const newPath = join(dataDirRoot, newKey);

    const oldExists = attempt(() => fileExistsFn(oldPath));

    if (isErr(oldExists)) {
      return makeErr(si`Failed to check file exists: ${oldExists.reason}`);
    }

    if (oldExists === false) {
      return makeErr(si`Item not found: ${oldKey}`);
    }

    const newExists = attempt(() => fileExistsFn(newPath));

    if (isErr(newExists)) {
      return makeErr(si`Failed to check file exists: ${newExists.reason}`);
    }

    if (newExists && !overwriteIfExists) {
      return makeErr(si`Item already exists: ${newKey}`);
    }

    if (newExists && overwriteIfExists) {
      const removeResult = removeItem(newPath);

      if (isErr(removeResult)) {
        return makeErr(si`Failed to overwrite existing file: ${removeResult.reason}`);
      }
    }

    const newDir = dirnameFn(newPath);
    const newDirExists = attempt(() => fileExistsFn(newDir));

    if (isErr(newDirExists)) {
      return makeErr(si`Failed to check new dir exists: ${newDir}`);
    }

    if (newDirExists === false) {
      mkdirp(newDir);
    }

    const result = attempt(() => renameFileFn(oldPath, newPath));

    if (isErr(result)) {
      return makeErr(si`Failed to rename file: ${result.reason}`);
    }
  }

  function listItems(
    key: StorageKey,
    listFilesFn: ListFilesFn = listFiles,
    fileExistsFn: FileExistsFn = fileExists
  ): Result<StorageKey[]> {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(si`Failed to check directory exists: ${fileExistsResult.reason}`);
    }

    const listFilesResult = attempt(() => listFilesFn(filePath));

    if (isErr(listFilesResult)) {
      return makeErr(si`Failed to list files: ${listFilesResult.reason}`);
    }

    return listFilesResult;
  }

  function listSubdirectories(
    key: StorageKey,
    listDirectoriesFn: ListDirectoriesFn = listDirectories,
    fileExistsFn: FileExistsFn = fileExists
  ): Result<StorageKey[]> {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(si`Failed to check directory exists: ${fileExistsResult.reason}`);
    }

    const listDirectoriesResult = attempt(() => listDirectoriesFn(filePath));

    if (isErr(listDirectoriesResult)) {
      return makeErr(si`Failed to list directories: ${listDirectoriesResult.reason}`);
    }

    return listDirectoriesResult;
  }

  function removeTree(key: StorageKey, rmdirRecursivelyFn = rmdirRecursively, fileExistsFn = fileExists): Result<void> {
    const dirPath = join(dataDirRoot, key);
    const dirExistsResult = attempt(() => fileExistsFn(dirPath));

    if (isErr(dirExistsResult)) {
      return makeErr(si`Failed to check directory exists: ${dirExistsResult.reason}`);
    }

    if (dirExistsResult === false) {
      return;
    }

    const rmdirResult = attempt(() => rmdirRecursivelyFn(dirPath));

    if (isErr(rmdirResult)) {
      return makeErr(si`Failed to delete directory: ${rmdirResult.reason}`);
    }
  }

  return {
    storeItem,
    loadItem,
    hasItem,
    removeItem,
    renameItem,
    listItems,
    listSubdirectories,
    removeTree,
  };
}

const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/;

function jsonParseFilter(_k: string, v: unknown) {
  return typeof v === 'string' && dateRegExp.test(v) ? new Date(v) : v;
}
