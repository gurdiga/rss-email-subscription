import { expect } from 'chai';
import {
  DeleteFileFn,
  FileExistsFn,
  ListDirectoriesFn,
  ListFilesFn,
  MkdirpFn,
  RenameFileFn,
  RmdirRecursivelyFn,
} from './io-isolation';
import { ReadFileFn, WriteFileFn } from './io-isolation';
import { makeErr } from '../shared/lang';
import { StorageKey, StorageValue, makeStorage } from './storage';
import { makePath } from '../shared/path-utils';
import { makeSpy, makeStub, makeThrowingStub } from '../shared/test-utils';
import { si } from '../shared/string-utils';
import { tmpdir } from 'os';

describe(makeStorage.name, () => {
  const dataDirRoot = tmpdir() + '/data';
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

      expect(mkdirpFn.calls[0]).deep.equal([si`${dataDirRoot}/path`], 'creates the necessary directory structure');
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

      expect(mkdirpFn.calls[0]).deep.equal(
        [si`${dataDirRoot}/path`],
        'tries to create the necessary directory structure'
      );
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
    const value = { number: 1, string: 'string' };

    const readFileFn = makeStub<ReadFileFn>(() => JSON.stringify(value));

    it('loads a JSON blob from the given file', () => {
      const result = loadItem(key, readFileFn);

      expect(readFileFn.calls).to.deep.equal([[expectedFilePath]]);
      expect(result).to.deep.equal(value);
    });

    it('parses properties containing only an ISO date string into a Date value', () => {
      const value = {
        dateField: '2023-07-06T09:25:16.415Z',
        textFieldWithADateStringInside:
          'This is a random text containing an ISO date string here 2023-07-06T09:25:16.415Z',
      };
      const readFileFn = makeStub<ReadFileFn>(() => JSON.stringify(value));

      const result = loadItem(key, readFileFn);
      const expectedResult = {
        dateField: new Date(value.dateField),
        textFieldWithADateStringInside: value.textFieldWithADateStringInside,
      };

      expect(result).to.deep.equal(expectedResult);
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
        makeErr(si`Failed to parse JSON at ${key}: Unexpected token 'o', \"non-json-string\" is not valid JSON`)
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
    const newPath = '/some/new/path/new-key';

    const fullOldPath = makePath(dataDirRoot, oldPath);
    const fullNewPath = makePath(dataDirRoot, newPath);

    it('renames an existing file', () => {
      const fileContents = 'the file contents';
      assertStoreItem(oldPath, fileContents);

      const result = renameItem(oldPath, newPath);

      expect(result, si`unexpected result: ${JSON.stringify(result)}`).to.be.undefined;
      expect(hasItem(oldPath), 'old file is no more').to.be.false;
      expect(loadItem(newPath), 'new file exists').to.equal(fileContents);
    });

    it('can overwrite existing destination', () => {
      const fileContents = 'the file contents';
      assertStoreItem(oldPath, fileContents);
      assertStoreItem(newPath, 'existing file');

      expect(renameItem(oldPath, newPath)).to.deep.equal(makeErr(si`Item already exists: ${newPath}`));
      expect(renameItem(oldPath, newPath, { overwriteIfExists: true })).to.be.undefined;
      expect(loadItem(newPath), 'new file exists').to.equal(fileContents);
      expect(hasItem(oldPath), 'old file is no more').to.be.false;
    });

    it('returns an Err value when file does not exist', () => {
      const renameFileFn = makeStub<RenameFileFn>();
      const fileExistsFn = makeStub<FileExistsFn>((filePath) => filePath !== fullOldPath);

      const result = renameItem(oldPath, newPath, { overwriteIfExists: false }, renameFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Item not found: /some/path/old-key'));
      expect(renameFileFn.calls).to.deep.equal([], 'renameFileFn not called');
    });

    it('returns an Err value when new file already exist', () => {
      const renameFileFn = makeStub<RenameFileFn>();
      const fileExistsFn = makeStub<FileExistsFn>(() => true);

      const result = renameItem(oldPath, newPath, { overwriteIfExists: false }, renameFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr(si`Item already exists: ${newPath}`));
      expect(renameFileFn.calls).to.deep.equal([], 'renameFileFn not called');
    });

    it('returns an Err value when renameFileFn fails', () => {
      const renameFileFn = makeStub<RenameFileFn>(() => {
        throw new Error('Boom!');
      });
      const fileExistsFn = makeStub<FileExistsFn>((filePath) => filePath === fullOldPath);

      const result = renameItem(oldPath, newPath, { overwriteIfExists: false }, renameFileFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to rename file: Boom!'));
      expect(renameFileFn.calls).to.deep.equal([[fullOldPath, fullNewPath]]);
    });

    afterEach(() => {
      assertRemoveItem(oldPath);
      assertRemoveItem(newPath);
    });

    function assertStoreItem(key: StorageKey, value: StorageValue) {
      const result = storeItem(key, value);

      expect(result, si`no error: ${JSON.stringify(result)}`).to.be.undefined;
    }

    function assertRemoveItem(key: StorageKey) {
      const result = removeItem(key);

      expect(result, si`no error: ${JSON.stringify(result)}`).to.be.undefined;
    }
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
      const rmdirFn = makeSpy<RmdirRecursivelyFn>();
      const fileExistsFn = makeStub<FileExistsFn>(() => true);

      removeTree(key, rmdirFn, fileExistsFn);

      expect(fileExistsFn.calls).to.deep.equal([[expectedFilePath]]);
      expect(rmdirFn.calls).to.deep.equal([[expectedFilePath]]);
    });

    it('succeedes if the directory does not exist', () => {
      const rmdirFn = makeSpy<RmdirRecursivelyFn>();
      const fileExistsFn = makeStub<FileExistsFn>(() => false);

      removeTree(key, rmdirFn, fileExistsFn);

      expect(fileExistsFn.calls).to.deep.equal([[expectedFilePath]]);
      expect(rmdirFn.calls).to.be.empty;
    });

    it('returns an Err value when can’t check directory exists or can’t delete it', () => {
      let rmdirFn = makeSpy<RmdirRecursivelyFn>();
      let fileExistsFn = makeThrowingStub<FileExistsFn>(new Error('Boom on exists!!'));
      let result = removeTree(key, rmdirFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to check directory exists: Boom on exists!!'));

      fileExistsFn = makeStub<FileExistsFn>(() => true);
      rmdirFn = makeThrowingStub<RmdirRecursivelyFn>(new Error('Boom on delete!!'));
      result = removeTree(key, rmdirFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr('Failed to delete directory: Boom on delete!!'));
    });
  });
});
