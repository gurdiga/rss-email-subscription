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

export type StorageKey = string; // Something like this: '/accounts/219812984/account.json'
type StorageValue = any; // Will get JSONified and stored in the file. TODO: Maybe constrain the type

export type AppStorage = ReturnType<typeof makeStorage>;

export function makeStorage(dataDirRoot: string) {
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
        return makeErr(`Can’t create storage directory structure: ${mkdirpResult.reason}`);
      }
    }

    const writeFileResult = attempt(() => writeFileFn(filePath, JSON.stringify(value)));

    if (isErr(writeFileResult)) {
      return makeErr(`Couldn’t write file: ${writeFileResult.reason}`);
    }
  }

  function loadItem(key: StorageKey, readFileFn: ReadFileFn = readFile): Result<StorageValue> {
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
  }

  function hasItem(key: StorageKey, fileExistsFn: FileExistsFn = fileExists) {
    const filePath = join(dataDirRoot, key);
    const fileExistsResult = attempt(() => fileExistsFn(filePath));

    if (isErr(fileExistsResult)) {
      return makeErr(`Can’t check file: ${fileExistsResult.reason}`);
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
      return makeErr(`Can’t check file exists: ${fileExistsResult.reason}`);
    }

    if (fileExistsResult === false) {
      return;
    }

    const deleteFileResult = attempt(() => deleteFileFn(filePath));

    if (isErr(deleteFileResult)) {
      return makeErr(`Can’t delete file: ${deleteFileResult.reason}`);
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
      return makeErr(`Can’t check directory exists: ${fileExistsResult.reason}`);
    }

    const listFilesResult = attempt(() => listFilesFn(filePath));

    if (isErr(listFilesResult)) {
      return makeErr(`Can’t list files: ${listFilesResult.reason}`);
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
      return makeErr(`Can’t check directory exists: ${fileExistsResult.reason}`);
    }

    const listDirectoriesResult = attempt(() => listDirectoriesFn(filePath));

    if (isErr(listDirectoriesResult)) {
      return makeErr(`Can’t list directories: ${listDirectoriesResult.reason}`);
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

function jsonParseFilter(_k: string, v: any) {
  return typeof v === 'string' && dateRegExp.test(v) ? new Date(v) : v;
}
