import { dirname, join } from 'node:path';
import {
  deleteFile,
  DeleteFileFn,
  fileExists,
  FileExistsFn,
  listFiles,
  listDirectories,
  ListFilesFn,
} from './io-isolation';
import { mkdirp, MkdirpFn, readFile, ReadFileFn, writeFile, WriteFileFn, ListDirectoriesFn } from './io-isolation';
import { attempt, isErr, makeErr, Result } from './lang';
import { si } from './string-utils';

export type StorageKey = string; // Something like this: '/accounts/219812984/account.json'
type StorageValue = any; // Will get JSONified and stored in the file.

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
  listItems: (key: StorageKey, listFilesFn?: ListFilesFn, fileExistsFn?: FileExistsFn) => Result<StorageKey[]>;

  listSubdirectories: (
    key: StorageKey,
    listDirectoriesFn?: ListDirectoriesFn,
    fileExistsFn?: FileExistsFn
  ) => Result<StorageKey[]>;
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

    const writeFileResult = attempt(() => writeFileFn(filePath, JSON.stringify(value)));

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
      return makeErr(si`Failed to parse JSON: ${jsonParseResult.reason}`);
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

  return {
    storeItem,
    loadItem,
    hasItem,
    removeItem,
    listItems,
    listSubdirectories,
  };
}

const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/;

function jsonParseFilter(_k: string, v: unknown) {
  return typeof v === 'string' && dateRegExp.test(v) ? new Date(v) : v;
}
