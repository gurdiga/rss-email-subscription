import { expect } from 'chai';
import {
  DeleteFileFn,
  FileExistsFn,
  ListDirectoriesFn,
  ListFilesFn,
  MkdirpFn,
  ReadFileFn,
  WriteFileFn,
} from './io-isolation';
import { makeErr } from './lang';
import { makeStorage } from './storage';
import { makeSpy, makeStub, makeThrowingStub } from './test-utils';

describe(makeStorage.name, () => {
  const dataDirRoot = '/data';
  const { loadItem, storeItem, hasItem, removeItem, listItems, listSubdirectories } = makeStorage(dataDirRoot);
  const key = '/path/destination.json';
  const expectedFilePath = `${dataDirRoot}${key}`;

  describe(storeItem.name, () => {
    const value = { number: 1, string: 'string', date: new Date() };

    const fileExistsFn = makeStub<FileExistsFn>(() => false);
    const writeFileFn = makeStub<WriteFileFn>();
    const mkdirpFn = makeStub<MkdirpFn>();

    it('stores the given value JSONified in the given file', () => {
      storeItem(key, value, mkdirpFn, writeFileFn, fileExistsFn);

      expect(mkdirpFn.calls[0]).deep.equal(['/data/path'], 'creates the necessary directory structure');
      expect(writeFileFn.calls[0]).deep.equal(
        [expectedFilePath, JSON.stringify(value)],
        'stores data in the given file'
      );
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
        [expectedFilePath, JSON.stringify(value)],
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

      expect(readFileFn.calls).to.deep.equal([[expectedFilePath]]);
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

      expect(result).to.be.true;

      fileExistsFn = makeStub<FileExistsFn>(() => false);
      result = hasItem(key, fileExistsFn);

      expect(result).to.be.false;
    });

    it('returns an Err value when can’t check for some reason', () => {
      let fileExistsFn = makeThrowingStub<FileExistsFn>(new Error('Nope!!'));
      let result = hasItem(key, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Can’t check file: Nope!!'));
    });
  });

  describe(removeItem.name, () => {
    it('removes the corresponding file', () => {
      const deleteFileFn = makeSpy<DeleteFileFn>();
      const fileExistsFn = makeStub<FileExistsFn>(() => true);

      removeItem(key, deleteFileFn, fileExistsFn);

      expect(fileExistsFn.calls).to.deep.equal([[expectedFilePath]]);
      expect(deleteFileFn.calls).to.deep.equal([[expectedFilePath]]);
    });

    it('succeedes if the file does not exist', () => {
      const deleteFileFn = makeSpy<DeleteFileFn>();
      const fileExistsFn = makeStub<FileExistsFn>(() => false);

      removeItem(key, deleteFileFn, fileExistsFn);

      expect(fileExistsFn.calls).to.deep.equal([[expectedFilePath]]);
      expect(deleteFileFn.calls).to.be.empty;
    });

    it('returns an Err value when can’t check file exists or can’t delete it', () => {
      let deleteFileFn = makeSpy<DeleteFileFn>();
      let fileExistsFn = makeThrowingStub<FileExistsFn>(new Error('Boom on exists!!'));
      let result = removeItem(key, deleteFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Can’t check file exists: Boom on exists!!'));

      fileExistsFn = makeStub<FileExistsFn>(() => true);
      deleteFileFn = makeThrowingStub<DeleteFileFn>(new Error('Boom on delete!!'));
      result = removeItem(key, deleteFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Can’t delete file: Boom on delete!!'));
    });
  });

  describe(listItems.name, () => {
    it('returns the list of files at the given path', () => {
      const fileNames = ['one.json', 'two.json', 'three.json'];
      const listFilesFn = makeStub<ListFilesFn>(() => fileNames);
      const fileExistsFn = makeStub<FileExistsFn>(() => true);
      const result = listItems('/key', listFilesFn, fileExistsFn);

      expect(result).to.deep.equal(fileNames);
    });

    it('returns an Err value when fail to check the key exists', () => {
      const listFilesFn = makeStub<ListFilesFn>(() => []);
      const fileExistsFn = makeThrowingStub<FileExistsFn>(new Error('Boom!?'));
      const result = listItems('/key', listFilesFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Can’t check directory exists: Boom!?'));
    });

    it('returns an Err value when fail to list files', () => {
      const listFilesFn = makeThrowingStub<ListFilesFn>(new Error('Boom on list files!?'));
      const fileExistsFn = makeStub<FileExistsFn>(() => true);
      const result = listItems('/key', listFilesFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Can’t list files: Boom on list files!?'));
    });
  });

  describe(listSubdirectories.name, () => {
    it('returns the list of subdirectories at the given path', () => {
      const dirNames = ['one', 'two', 'three'];
      const listDirectoriesFn = makeStub<ListDirectoriesFn>(() => dirNames);
      const fileExistsFn = makeStub<FileExistsFn>(() => true);
      const result = listSubdirectories('/key', listDirectoriesFn, fileExistsFn);

      expect(result).to.deep.equal(dirNames);
    });

    it('returns an Err value when fail to check the key exists', () => {
      const listDirectoriesFn = makeStub<ListDirectoriesFn>(() => []);
      const fileExistsFn = makeThrowingStub<FileExistsFn>(new Error('Boom!?'));
      const result = listSubdirectories('/key', listDirectoriesFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Can’t check directory exists: Boom!?'));
    });

    it('returns an Err value when fail to list files', () => {
      const listDirectoriesFn = makeThrowingStub<ListDirectoriesFn>(new Error('Boom on list files!?'));
      const fileExistsFn = makeStub<FileExistsFn>(() => true);
      const result = listItems('/key', listDirectoriesFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Can’t list files: Boom on list files!?'));
    });
  });
});
