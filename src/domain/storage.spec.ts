import { expect } from 'chai';
import {
  DeleteFileFn,
  FileExistsFn,
  ListDirectoriesFn,
  ListFilesFn,
  MkdirpFn,
  RenameFileFn,
  RmdirFn,
} from './io-isolation';
import { ReadFileFn, WriteFileFn } from './io-isolation';
import { makeErr } from '../shared/lang';
import { makeStorage } from './storage';
import { makePath } from '../shared/path-utils';
import { makeSpy, makeStub, makeThrowingStub } from '../shared/test-utils';
import { si } from '../shared/string-utils';

describe(makeStorage.name, () => {
  const dataDirRoot = '/data';
  const { loadItem, storeItem, hasItem, removeItem, renameItem, listItems, listSubdirectories, removeTree } =
    makeStorage(dataDirRoot);
  const key = '/path/destination.json';
  const expectedFilePath = makePath(dataDirRoot, key);

  describe(storeItem.name, () => {
    const value = { number: 1, string: 'string', date: new Date() };

    const fileExistsFn = makeStub<FileExistsFn>(() => false);
    const writeFileFn = makeStub<WriteFileFn>();
    const mkdirpFn = makeStub<MkdirpFn>();

    it('stores the given value JSONified in the given file', () => {
      storeItem(key, value, mkdirpFn, writeFileFn, fileExistsFn);

      expect(mkdirpFn.calls[0]).deep.equal(['/data/path'], 'creates the necessary directory structure');
      expect(writeFileFn.calls[0]).deep.equal(
        [expectedFilePath, JSON.stringify(value, null, 2)],
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
      expect(result).to.deep.equal(makeErr('Failed to create storage directory structure: No space left on device!!'));
    });

    it('returns an Err value when can’t write file', () => {
      const errorMessage = 'Disk is full!!';
      const writeFileFn = makeStub<WriteFileFn>(() => {
        throw new Error(errorMessage);
      });
      const result = storeItem(key, value, mkdirpFn, writeFileFn, fileExistsFn);

      expect(writeFileFn.calls[0]).deep.equal(
        [expectedFilePath, JSON.stringify(value, null, 2)],
        'stores data in the given file'
      );
      expect(result).to.deep.equal(makeErr('Couldn’t write file: Disk is full!!'));
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

      expect(result).to.deep.equal(makeErr('Failed to read file: Permission denied!!'));
    });

    it('returns an Err value when can’t parse JSON contents', () => {
      const readFileFn = makeStub<ReadFileFn>(() => 'non-json-string');
      const result = loadItem(key, readFileFn);

      expect(result).to.deep.equal(
        makeErr(si`Failed to parse JSON at ${key}: Unexpected token o in JSON at position 1`)
      );
    });
  });

  describe(hasItem.name, () => {
    it('tells if the corresponding file exists', () => {
      let fileExistsFn = makeStub<FileExistsFn>((filePath) => filePath === makePath(dataDirRoot, key));
      let result = hasItem(key, fileExistsFn);

      expect(result).to.be.true;

      fileExistsFn = makeStub<FileExistsFn>((filePath) => !(filePath === makePath(dataDirRoot, key)));
      result = hasItem(key, fileExistsFn);

      expect(result).to.be.false;
    });

    it('returns an Err value when can’t check for some reason', () => {
      let fileExistsFn = makeThrowingStub<FileExistsFn>(new Error('Nope!!'));
      let result = hasItem(key, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to check file: Nope!!'));
    });
  });

  describe(renameItem.name, () => {
    const oldPath = '/some/path/old-key';
    const newPath = '/some/path/new-key';

    const fullOldPath = makePath(dataDirRoot, oldPath);
    const fullNewPath = makePath(dataDirRoot, newPath);

    it('renames an existing file', () => {
      const renameFileFn = makeStub<RenameFileFn>();
      const fileExistsFn = makeStub<FileExistsFn>((filePath) => filePath === fullOldPath);

      const result = renameItem(oldPath, newPath, renameFileFn, fileExistsFn);

      expect(result, si`result: ${JSON.stringify(result)}`).to.be.undefined;
      expect(renameFileFn.calls).to.deep.equal([[fullOldPath, fullNewPath]]);
      expect(fileExistsFn.calls).to.deep.equal([[fullOldPath], [fullNewPath]]);
    });

    it('returns an Err value when file does not exist', () => {
      const renameFileFn = makeStub<RenameFileFn>();
      const fileExistsFn = makeStub<FileExistsFn>((filePath) => filePath !== fullOldPath);

      const result = renameItem(oldPath, newPath, renameFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Item not found: /some/path/old-key'));
      expect(renameFileFn.calls).to.deep.equal([], 'renameFileFn not called');
    });

    it('returns an Err value when new file already exist', () => {
      const renameFileFn = makeStub<RenameFileFn>();
      const fileExistsFn = makeStub<FileExistsFn>(() => true);

      const result = renameItem(oldPath, newPath, renameFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Item already exists: /some/path/new-key'));
      expect(renameFileFn.calls).to.deep.equal([], 'renameFileFn not called');
    });

    it('returns an Err value when renameFileFn fails', () => {
      const renameFileFn = makeStub<RenameFileFn>(() => {
        throw new Error('Boom!');
      });
      const fileExistsFn = makeStub<FileExistsFn>((filePath) => filePath === fullOldPath);

      const result = renameItem(oldPath, newPath, renameFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to rename file: Boom!'));
      expect(renameFileFn.calls).to.deep.equal([[fullOldPath, fullNewPath]]);
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

      expect(result).to.deep.equal(makeErr('Failed to check file exists: Boom on exists!!'));

      fileExistsFn = makeStub<FileExistsFn>(() => true);
      deleteFileFn = makeThrowingStub<DeleteFileFn>(new Error('Boom on delete!!'));
      result = removeItem(key, deleteFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to delete file: Boom on delete!!'));
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

      expect(result).to.deep.equal(makeErr('Failed to check directory exists: Boom!?'));
    });

    it('returns an Err value when fail to list files', () => {
      const listFilesFn = makeThrowingStub<ListFilesFn>(new Error('Boom on list files!?'));
      const fileExistsFn = makeStub<FileExistsFn>(() => true);
      const result = listItems('/key', listFilesFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to list files: Boom on list files!?'));
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

      expect(result).to.deep.equal(makeErr('Failed to check directory exists: Boom!?'));
    });

    it('returns an Err value when fail to list files', () => {
      const listDirectoriesFn = makeThrowingStub<ListDirectoriesFn>(new Error('Boom on list files!?'));
      const fileExistsFn = makeStub<FileExistsFn>(() => true);
      const result = listItems('/key', listDirectoriesFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to list files: Boom on list files!?'));
    });
  });

  describe(removeTree.name, () => {
    it('removes the given directory', () => {
      const rmdirFn = makeSpy<RmdirFn>();
      const fileExistsFn = makeStub<FileExistsFn>(() => true);

      removeTree(key, rmdirFn, fileExistsFn);

      expect(fileExistsFn.calls).to.deep.equal([[expectedFilePath]]);
      expect(rmdirFn.calls).to.deep.equal([[expectedFilePath]]);
    });

    it('succeedes if the directory does not exist', () => {
      const rmdirFn = makeSpy<RmdirFn>();
      const fileExistsFn = makeStub<FileExistsFn>(() => false);

      removeTree(key, rmdirFn, fileExistsFn);

      expect(fileExistsFn.calls).to.deep.equal([[expectedFilePath]]);
      expect(rmdirFn.calls).to.be.empty;
    });

    it('returns an Err value when can’t check directory exists or can’t delete it', () => {
      let rmdirFn = makeSpy<RmdirFn>();
      let fileExistsFn = makeThrowingStub<FileExistsFn>(new Error('Boom on exists!!'));
      let result = removeTree(key, rmdirFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to check directory exists: Boom on exists!!'));

      fileExistsFn = makeStub<FileExistsFn>(() => true);
      rmdirFn = makeThrowingStub<RmdirFn>(new Error('Boom on delete!!'));
      result = removeTree(key, rmdirFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to delete directory: Boom on delete!!'));
    });
  });
});
