import { expect } from 'chai';
import { makeErr } from './lang';
import { si } from './string-utils';
import { makeHttpUrl, maxUrlLength } from './url';

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

  it('rejects URLs longer than maxUrlLength', () => {
    const urlString = 'https://test.com/'.concat('x'.repeat(maxUrlLength));

    expect(makeHttpUrl(urlString)).to.deep.equal(
      makeErr(si`The URL needs to have less than ${maxUrlLength} characters`, 'url')
    );
  });
});
