import { expect } from 'chai';
import { makeRssUrl } from './rss-url';

describe(makeRssUrl.name, () => {
  it('returns an URL from the string', () => {
    const urlString = 'https://example.com/feed.com';

    expect(makeRssUrl(urlString)).to.deep.equal(new URL(urlString));
  });

  it('returns an Err value when the string is not a valid URL', () => {
    expect(makeRssUrl('not a real URL')).to.deep.equal({
      kind: 'Err',
      reason: 'Invalid URL: not a real URL',
    });

    expect(makeRssUrl('')).to.deep.equal({
      kind: 'Err',
      reason: 'Missing URL string',
    });

    expect(makeRssUrl(undefined)).to.deep.equal({
      kind: 'Err',
      reason: 'Missing URL string',
    });
  });
});
