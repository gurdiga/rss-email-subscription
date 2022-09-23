import { dirname, join } from 'node:path';
import {
  deleteFile,
  DeleteFileFn,
  fileExists,
  FileExistsFn,
  listFiles,
  listDirectories,
  ListFilesFn,
  mkdirp,
  MkdirpFn,
  readFile,
  ReadFileFn,
  writeFile,
  WriteFileFn,
  ListDirectoriesFn,
} from './io';
import { attempt, isErr, makeErr, Result } from './lang';

export interface AppStorage {
  storeItem: StoreItemFn;
  loadItem: LoadItemFn;
  hasItem: HasItemFn;
  removeItem: RemoveItemFn;
  listItems: ListItemsFn;
  listSubdirectories: ListSubdirectoriesFn;
}

type StoreItemFn = (
  key: StorageKey,
  value: StorageValue,
  mkdirpFn?: MkdirpFn,
  writeFileFn?: WriteFileFn,
  fileExistsFn?: FileExistsFn
) => Result<true>;

type LoadItemFn = (key: StorageKey, readFileFn?: ReadFileFn) => Result<StorageValue>;
type HasItemFn = (key: StorageKey, fileExistsFn?: FileExistsFn) => Result<boolean>;
type RemoveItemFn = (key: StorageKey, deleteFileFn?: DeleteFileFn, fileExistsFn?: FileExistsFn) => Result<true>;
type ListItemsFn = (key: StorageKey, lisstFilesFn?: ListFilesFn, fileExistsFn?: FileExistsFn) => Result<StorageKey[]>;
type ListSubdirectoriesFn = (
  key: StorageKey,
  listDirectoriesFn?: ListDirectoriesFn,
  fileExistsFn?: FileExistsFn
) => Result<StorageKey[]>;

type StorageKey = string; // Something like this: '/accounts/219812984/account.json'
type StorageValue = any; // Will get JSONified and stored in the file. TODO: Maybe constrain the type

export function makeStorage(dataDirRoot: string): AppStorage {
  const storeItem: StoreItemFn = function storeItem(
    key,
    value,
    mkdirpFn = mkdirp,
    writeFileFn = writeFile,
    fileExistsFn = fileExists
  ) {
    const filePath = join(dataDirRoot, key);
    const dirPath = dirname(filePath);

    if (!fileExistsFn(dirPath)) {
      const mkdirpResult = attempt(() => mkdirpFn(dirPath));

      if (isErr(mkdirpResult)) {
        return makeErr(`Can’t create storage directory structure: ${mkdirpResult.reason}`);
      }
    }

    const writeFileResult = attempt(() => writeFileFn(filePath, JSON.stringify(value)));

    if (isErr(writeFileResult)) {
      return makeErr(`Couldn’t write file: ${writeFileResult.reason}`);
    }

    return true;
  };

  const loadItem: LoadItemFn = function loadItem(key, readFileFn = readFile) {
    const filePath = join(dataDirRoot, key);
    const readFileResult = attempt(() => readFileFn(filePath));

    if (isErr(readFileResult)) {
      return makeErr(`Can’t read file: ${readFileResult.reason}`);
    }

    const jsonParseResult = attempt(() => JSON.parse(readFileResult, jsonParseFilter));

    if (isErr(jsonParseResult)) {
      return makeErr(`Can’t parse JSON: ${jsonParseResult.reason}`);
    }

    return jsonParseResult;
  };

  const hasItem: HasItemFn = function hasItem(key, fileExistsFn = fileExists) {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(`Can’t check file: ${fileExistsResult.reason}`);
    }

    return fileExistsResult;
  };

  const removeItem: RemoveItemFn = function removeItem(key, deleteFileFn = deleteFile, fileExistsFn = fileExists) {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(`Can’t check file exists: ${fileExistsResult.reason}`);
    }

    if (fileExistsResult === false) {
      return true;
    }

    const deleteFileResult = attempt(() => deleteFileFn(filePath));

    if (isErr(deleteFileResult)) {
      return makeErr(`Can’t delete file: ${deleteFileResult.reason}`);
    }

    return true;
  };

  const listItems: ListItemsFn = function listItems(key, listFilesFn = listFiles, fileExistsFn = fileExists) {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(`Can’t check directory exists: ${fileExistsResult.reason}`);
    }

    const listFilesResult = attempt(() => listFilesFn(filePath));

    if (isErr(listFilesResult)) {
      return makeErr(`Can’t list files: ${listFilesResult.reason}`);
    }

    return listFilesResult;
  };

  const listSubdirectories: ListSubdirectoriesFn = function listSubdirectories(
    key,
    listDirectoriesFn = listDirectories,
    fileExistsFn = fileExists
  ) {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(`Can’t check directory exists: ${fileExistsResult.reason}`);
    }

    const listDirectoriesResult = attempt(() => listDirectoriesFn(filePath));

    if (isErr(listDirectoriesResult)) {
      return makeErr(`Can’t list directories: ${listDirectoriesResult.reason}`);
    }

    return listDirectoriesResult;
  };

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

function jsonParseFilter(_k: string, v: any) {
  return typeof v === 'string' && dateRegExp.test(v) ? new Date(v) : v;
}
