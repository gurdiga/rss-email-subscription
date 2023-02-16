import { expect } from 'chai';
import { makeErr } from './lang';
import { makeHttpUrl } from './url';

describe(makeHttpUrl.name, () => {
  it('returns an URL value from a valid URL string', () => {
    const validURLString = 'https://test.com/something.html';

    expect(makeHttpUrl(validURLString)).to.deep.equal(new URL(validURLString));
  });

  it('accepts a basURL argument', () => {
    const baseURL = 'https://test.com';
    const validURLString = 'something.html';

    expect(makeHttpUrl(validURLString, baseURL)).to.deep.equal(new URL(validURLString, baseURL));
  });

  it('returns an Err value from an invalid URL string', () => {
    expect(makeHttpUrl('non-url-string')).to.deep.equal(makeErr('Invalid URL: non-url-string', 'url'));
  });

  it('rejects non-HTTP URLs', () => {
    expect(makeHttpUrl('ftp://file-server.com/feed.xml')).to.deep.equal(makeErr('Invalid URL protocol: “ftp:”', 'url'));
  });
});
