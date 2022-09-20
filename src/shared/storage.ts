import { dirname, join } from 'node:path';
import { fileExists, FileExistsFn, mkdirp, MkdirpFn, readFile, ReadFileFn, writeFile, WriteFileFn } from './io';
import { makeErr, Result } from './lang';

export interface AppStorage {
  storeItem: StoreItemFn;
  loadItem: LoadItemFn;
}

export function makeStorage(dataDirRoot: string): AppStorage {
  return {
    storeItem: makeStoreItemFn(dataDirRoot),
    loadItem: makeLoadItemFn(dataDirRoot),
  };
}

type StorageKey = string; // Something like this: '/accounts/219812984/account.json'
type StorageValue = any; // Will get JSONified and stored in the file. TODO: Maybe constrain the type

type StoreItemFn = (
  key: StorageKey,
  value: StorageValue,
  mkdirpFn?: MkdirpFn,
  writeFileFn?: WriteFileFn,
  fileExistsFn?: FileExistsFn
) => Result<true>;

function makeStoreItemFn(dataDirRoot: string): StoreItemFn {
  return <StoreItemFn>(
    function storeItem(key, value, mkdirpFn = mkdirp, writeFileFn = writeFile, fileExistsFn = fileExists) {
      const filePath = join(dataDirRoot, key);
      const dirPath = dirname(filePath);

      if (!fileExistsFn(dirPath)) {
        try {
          mkdirpFn(dirPath);
        } catch (error) {
          return makeErr(error);
        }
      }

      try {
        writeFileFn(filePath, JSON.stringify(value));
      } catch (error) {
        return makeErr(error);
      }

      return true;
    }
  );
}

type LoadItemFn = (key: StorageKey, readFileFn: ReadFileFn) => StorageValue;

function makeLoadItemFn(dataDirRoot: string): LoadItemFn {
  const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/;

  return <LoadItemFn>function loadItem(key, readFileFn = readFile) {
    const filePath = join(dataDirRoot, key);

    try {
      const json = readFileFn(filePath);

      try {
        return JSON.parse(json, (_k, v) => (typeof v === 'string' && dateRegExp.test(v) ? new Date(v) : v));
      } catch (error) {
        return makeErr(error);
      }
    } catch (error) {
      return makeErr(error);
    }
  };
}
