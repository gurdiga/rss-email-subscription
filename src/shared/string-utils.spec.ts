import { expect } from 'chai';
import { si } from './string-utils';

describe(si.name, () => {
  it('concatenates the given strings and requires interpolated expressions to be strings or numbers', () => {
    const string = 'Yes!';
    const number = 42;

    expect(si`Does it work? ${string} ${number}`).to.equal('Does it work? Yes! 42');
  });
});
