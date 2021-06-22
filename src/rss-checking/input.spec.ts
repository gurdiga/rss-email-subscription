import { expect } from 'chai';
import { InvalidDataDir, makeDataDir } from './data-dir';
import { makeInput } from './input';
import { InvalidRssUrl, makeRssUrl } from './rss-url';

describe('makeInput', () => {
  it('returns a ValidInput when input is valid', () => {
    const urlString = 'https://example.com/feed.xml';
    const dataDirString = '/some/path';

    expect(makeInput(urlString, dataDirString)).to.deep.equal({
      kind: 'ValidInput',
      value: {
        url: new URL(urlString),
        dataDir: {
          kind: 'ValidDataDir',
          value: dataDirString,
        },
      },
    });
  });

  it('returns an InvalidInput value when some of the pieces is invalid', () => {
    const invalidUrlString = 'not a real URL';

    expect(makeInput(invalidUrlString, '/some/path')).to.deep.equal({
      kind: 'InvalidInput',
      reason: 'Invalid RSS URL: ' + (makeRssUrl(invalidUrlString) as InvalidRssUrl).reason,
    });

    const validUrlString = 'https://example.com/feed.xml';
    const invalidDataDirString = '';

    expect(makeInput(validUrlString, invalidDataDirString)).to.deep.equal({
      kind: 'InvalidInput',
      reason: 'Invalid data dir: ' + (makeDataDir(invalidDataDirString) as InvalidDataDir).reason,
    });
  });
});
