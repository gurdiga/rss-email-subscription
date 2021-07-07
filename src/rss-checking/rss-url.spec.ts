import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makeRssUrl } from './rss-url';

describe(makeRssUrl.name, () => {
  it('returns an URL from the string', () => {
    const urlString = 'https://example.com/feed.com';

    expect(makeRssUrl(urlString)).to.deep.equal(new URL(urlString));
  });

  it('returns an Err value when the string is not a valid URL', () => {
    expect(makeRssUrl('not a real URL')).to.deep.equal(makeErr('Invalid URL: not a real URL'));
    expect(makeRssUrl('')).to.deep.equal(makeErr('Missing URL string'));
    expect(makeRssUrl(undefined)).to.deep.equal(makeErr('Missing URL string'));
  });
});
