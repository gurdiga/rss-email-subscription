import { dirname, join } from 'node:path';
import { fileExists, FileExistsFn, mkdirp, MkdirpFn, readFile, ReadFileFn, writeFile, WriteFileFn } from './io';
import { attempt, isErr, makeErr, Result } from './lang';

export interface AppStorage {
  storeItem: StoreItemFn;
  loadItem: LoadItemFn;
}

type StoreItemFn = (
  key: StorageKey,
  value: StorageValue,
  mkdirpFn?: MkdirpFn,
  writeFileFn?: WriteFileFn,
  fileExistsFn?: FileExistsFn
) => Result<true>;

type LoadItemFn = (key: StorageKey, readFileFn?: ReadFileFn) => Result<StorageValue>;

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

  return {
    storeItem,
    loadItem,
  };
}

const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/;

function jsonParseFilter(_k: string, v: any) {
  return typeof v === 'string' && dateRegExp.test(v) ? new Date(v) : v;
}
