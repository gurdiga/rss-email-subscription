import { expect } from 'chai';
import { si } from './string-utils';

describe(si.name, () => {
  it('concatenates the given strings and requires interpolated expressions to be strings', () => {
    const does = 'Yes!';
    expect(si`Does it work? ${does}`).to.equal('Does it work? Yes!');
  });
});
