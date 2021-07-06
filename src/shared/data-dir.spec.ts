import { expect } from 'chai';
import { makeDataDir } from './data-dir';

describe(makeDataDir.name, () => {
  it('returns a ValidDataDir value for the given path', () => {
    expect(makeDataDir('/some/dir')).to.deep.equal({ kind: 'ValidDataDir', value: '/some/dir' });
    expect(makeDataDir('./dir')).to.deep.equal({ kind: 'ValidDataDir', value: `${process.cwd()}/dir` });
    expect(makeDataDir('dir/')).to.deep.equal({ kind: 'ValidDataDir', value: `${process.cwd()}/dir` });
    expect(makeDataDir('./')).to.deep.equal({ kind: 'ValidDataDir', value: `${process.cwd()}` });
    expect(makeDataDir('.')).to.deep.equal({ kind: 'ValidDataDir', value: `${process.cwd()}` });
  });

  it('returns an InvalidDataDir value with invalid input', () => {
    expect(makeDataDir('')).to.deep.equal({ kind: 'InvalidDataDir', reason: 'Missing value' });
  });
});
