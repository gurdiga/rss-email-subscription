import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makeUrl } from './rss-url';

describe(makeUrl.name, () => {
  it('returns an URL from the string', () => {
    const urlString = 'https://example.com/feed.com';

    expect(makeUrl(urlString)).to.deep.equal(new URL(urlString));
  });

  it('returns an Err value when the string is not a valid URL', () => {
    expect(makeUrl('not a real URL')).to.deep.equal(makeErr('Invalid URL: not a real URL'));
    expect(makeUrl('')).to.deep.equal(makeErr('Missing URL string'));
    expect(makeUrl(undefined)).to.deep.equal(makeErr('Missing URL string'));
  });
});
