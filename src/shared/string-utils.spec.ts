import { expect } from 'chai';
import { rawsi, si } from './string-utils';

describe(si.name, () => {
  it('typechecks to only allows number and string values to be interpolated', () => {
    const string = 'Yes!';
    const number = 42;

    expect(si`Does it work? ${string} ${number}`).to.equal('Does it work? Yes! 42');
  });
});

describe(rawsi.name, () => {
  it('has the name ending in "si" to pass lint-require-strict-interpolation', () => {
    expect(rawsi.name.endsWith('si')).to.be.true;
  });

  it('screens backslashes in RegExp’s, exactly like String.raw', () => {
    expect(new RegExp(rawsi`\+`)).to.deep.equal(new RegExp('\\+'));
  });

  it('typechecks to only allows number and string values to be interpolated', () => {
    expect(rawsi`one: ${1}\ntwo: ${'doi'}`).to.equal('one: 1\\ntwo: doi');
  });
});
