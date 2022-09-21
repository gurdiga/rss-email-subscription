import { expect } from 'chai';
import { FileExistsFn, MkdirpFn, ReadFileFn, WriteFileFn } from './io';
import { makeErr } from './lang';
import { makeStorage } from './storage';
import { makeStub, makeThrowingStub } from './test-utils';

describe(makeStorage.name, () => {
  const dataDirRoot = '/data';
  const { loadItem, storeItem, hasItem } = makeStorage(dataDirRoot);
  const key = '/path/destination.json';

  describe(storeItem.name, () => {
    const value = { number: 1, string: 'string', date: new Date() };

    const fileExistsFn = makeStub<FileExistsFn>(() => false);
    const writeFileFn = makeStub<WriteFileFn>();
    const mkdirpFn = makeStub<MkdirpFn>();

    it('stores the given value JSONified in the given file', () => {
      const result = storeItem(key, value, mkdirpFn, writeFileFn, fileExistsFn);

      expect(mkdirpFn.calls[0]).deep.equal(['/data/path'], 'creates the necessary directory structure');
      expect(writeFileFn.calls[0]).deep.equal(
        ['/data/path/destination.json', JSON.stringify(value)],
        'stores data in the given file'
      );
      expect(result).to.be.true;
    });

    it('returns an Err value when can’t create directory structure', () => {
      const errorMessage = 'No space left on device!!';
      const mkdirpFn = makeStub<MkdirpFn>(() => {
        throw new Error(errorMessage);
      });
      const result = storeItem(key, value, mkdirpFn, writeFileFn, fileExistsFn);

      expect(mkdirpFn.calls[0]).deep.equal(['/data/path'], 'tries to create the necessary directory structure');
      expect(result).to.deep.equal(makeErr('Can’t create storage directory structure: No space left on device!!'));
    });

    it('returns an Err value when can’t write file', () => {
      const errorMessage = 'Disk is full!!';
      const writeFileFn = makeStub<WriteFileFn>(() => {
        throw new Error(errorMessage);
      });
      const result = storeItem(key, value, mkdirpFn, writeFileFn, fileExistsFn);

      expect(writeFileFn.calls[0]).deep.equal(
        ['/data/path/destination.json', JSON.stringify(value)],
        'stores data in the given file'
      );
      expect(result).to.deep.equal(makeErr(`Couldn’t write file: Disk is full!!`));
    });
  });

  describe(loadItem.name, () => {
    const value = { number: 1, string: 'string', date: new Date() };

    const readFileFn = makeStub<ReadFileFn>(() => JSON.stringify(value));

    it('loads a JSON blob from the given file', () => {
      const result = loadItem(key, readFileFn);

      expect(result).to.deep.equal(value);
    });

    it('returns an Err value when can’t read file', () => {
      const error = new Error('Permission denied!!');
      const readFileFn = makeThrowingStub<ReadFileFn>(error);
      const result = loadItem(key, readFileFn);

      expect(result).to.deep.equal(makeErr('Can’t read file: Permission denied!!'));
    });

    it('returns an Err value when can’t parse JSON contents', () => {
      const readFileFn = makeStub<ReadFileFn>(() => 'non-json-string');
      const result = loadItem(key, readFileFn);

      expect(result).to.deep.equal(makeErr('Can’t parse JSON: Unexpected token o in JSON at position 1'));
    });
  });

  describe(hasItem.name, () => {
    it('tells if the corresponding file exists', () => {
      let fileExistsFn = makeStub<FileExistsFn>(() => true);
      let result = hasItem(key, fileExistsFn);

      expect(result).to.equal(true);

      fileExistsFn = makeStub<FileExistsFn>(() => false);
      result = hasItem(key, fileExistsFn);

      expect(result).to.equal(false);
    });

    it('returns an Err value when can’t cheeck for some reason', () => {
      let fileExistsFn = makeThrowingStub<FileExistsFn>(new Error('Nope!!'));
      let result = hasItem(key, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Can’t check file: Nope!!'));
    });
  });
});
