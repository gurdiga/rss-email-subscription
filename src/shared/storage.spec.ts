import { expect } from 'chai';
import { FileExistsFn, MkdirpFn, WriteFileFn } from './io';
import { makeErr } from './lang';
import { storeItem } from './storage';
import { makeStub } from './test-utils';

describe(storeItem.name, () => {
  const key = '/path/destination.json';
  const value = { number: 1, string: 'string', date: new Date() };
  const dataDirRoot = '/data';

  const fileExistsFn = makeStub<FileExistsFn>(() => false);
  const writeFileFn = makeStub<WriteFileFn>();
  const mkdirpFn = makeStub<MkdirpFn>();

  it('stores the given value JSONified in the given file', () => {
    const result = storeItem(key, value, dataDirRoot, mkdirpFn, writeFileFn, fileExistsFn);

    expect(mkdirpFn.calls[0]).deep.equal(['/data/path'], 'creates the necessary directory structure');
    expect(writeFileFn.calls[0]).deep.equal(
      ['/data/path/destination.json', JSON.stringify(value)],
      'stores data in the given file'
    );
    expect(result).to.be.true;
  });

  it('returns an Err value when can’t create directory structure', () => {
    const errorMessage = 'Can’t create directory structure!!';
    const mkdirpFn = makeStub<MkdirpFn>(() => {
      throw new Error(errorMessage);
    });
    const result = storeItem(key, value, dataDirRoot, mkdirpFn, writeFileFn, fileExistsFn);

    expect(mkdirpFn.calls[0]).deep.equal(['/data/path'], 'tries to create the necessary directory structure');
    expect(result).to.deep.equal(makeErr(errorMessage));
  });

  it('returns an Err value when can’t write file', () => {
    const errorMessage = 'Can’t write file!!';
    const writeFileFn = makeStub<WriteFileFn>(() => {
      throw new Error(errorMessage);
    });
    const result = storeItem(key, value, dataDirRoot, mkdirpFn, writeFileFn, fileExistsFn);

    expect(writeFileFn.calls[0]).deep.equal(
      ['/data/path/destination.json', JSON.stringify(value)],
      'stores data in the given file'
    );
    expect(result).to.deep.equal(makeErr(errorMessage));
  });
});
