import { expect } from 'chai';
import { makeRssUrl } from './rss-url';

describe(makeRssUrl.name, () => {
  it('returns a ValidRssUrl value from the string', () => {
    const urlString = 'https://example.com/feed.com';

    expect(makeRssUrl(urlString)).to.deep.equal({
      kind: 'ValidRssUrl',
      value: new URL(urlString),
    });
  });

  it('returns an InvalidRssUrl value when the string is not a valid URL', () => {
    expect(makeRssUrl('not a real URL')).to.deep.equal({
      kind: 'InvalidRssUrl',
      reason: 'Invalid URL: not a real URL',
    });

    expect(makeRssUrl('')).to.deep.equal({
      kind: 'InvalidRssUrl',
      reason: 'Missing URL string',
    });

    expect(makeRssUrl(undefined)).to.deep.equal({
      kind: 'InvalidRssUrl',
      reason: 'Missing URL string',
    });
  });
});
