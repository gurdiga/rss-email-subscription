import { expect } from 'chai';
import { makeDataDir } from './data-dir';
import { makeErr } from './lang';

describe(makeDataDir.name, () => {
  it('returns a DataDir value for the given path', () => {
    expect(makeDataDir('/some/dir')).to.deep.equal({ kind: 'DataDir', value: '/some/dir' });
    expect(makeDataDir('./dir')).to.deep.equal({ kind: 'DataDir', value: `${process.cwd()}/dir` });
    expect(makeDataDir('dir/')).to.deep.equal({ kind: 'DataDir', value: `${process.cwd()}/dir` });
    expect(makeDataDir('./')).to.deep.equal({ kind: 'DataDir', value: `${process.cwd()}` });
    expect(makeDataDir('.')).to.deep.equal({ kind: 'DataDir', value: `${process.cwd()}` });
  });

  it('accepts the relative root as the second arg', () => {
    const dataDirRoot = '/some/path';

    expect(makeDataDir('justaddlight', dataDirRoot)).to.deep.equal({
      kind: 'DataDir',
      value: `${dataDirRoot}/justaddlight`,
    });
  });

  it('returns an Err value with invalid input', () => {
    expect(makeDataDir('')).to.deep.equal(makeErr('Missing value'));
  });
});
