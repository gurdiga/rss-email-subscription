import { expect } from 'chai';
import { makeErr } from '../../web-ui/shared/lang';
import { makeUrl } from './rss-url';

describe(makeUrl.name, () => {
  it('returns an URL from the string', () => {
    const urlString = 'https://example.com/feed.com';

    expect(makeUrl(urlString)).to.deep.equal(new URL(urlString));
  });

  it('returns an Err value when the string is not a valid URL', () => {
    expect(makeUrl('not a real URL')).to.deep.equal(makeErr('ERR_INVALID_URL: not a real URL'));
    expect(makeUrl('https://')).to.deep.equal(makeErr('ERR_INVALID_URL: https://'));
    expect(makeUrl('file://')).to.deep.equal(makeErr('Invalid protocol: "file:"'));
    expect(makeUrl('')).to.deep.equal(makeErr('Missing URL string'));
    expect(makeUrl(undefined)).to.deep.equal(makeErr('Missing URL string'));
  });
});
