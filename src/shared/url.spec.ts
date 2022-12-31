import { expect } from 'chai';
import { makeErr } from './lang';
import { makeUrl } from './url';

describe(makeUrl.name, () => {
  it('returns an URL value from a valid URL string', () => {
    const validURLString = 'https://test.com/something.html';

    expect(makeUrl(validURLString)).to.deep.equal(new URL(validURLString));
  });

  it('accepts a basURL argument', () => {
    const baseURL = 'https://test.com';
    const validURLString = 'something.html';

    expect(makeUrl(validURLString, baseURL)).to.deep.equal(new URL(validURLString, baseURL));
  });

  it('returns an Err value from an invalid URL string', () => {
    expect(makeUrl('non-url-string')).to.deep.equal(makeErr('Invalid URL string: non-url-string'));
  });
});
