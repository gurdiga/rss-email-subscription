import { expect } from 'chai';
import { InvalidDataDir, makeDataDir } from './data-dir';
import { parseArgs } from './args';
import { InvalidRssUrl, makeRssUrl } from './rss-url';

describe(parseArgs.name, () => {
  it('returns a ValidArgs when input is valid', () => {
    const urlString = 'https://example.com/feed.xml';
    const dataDirString = '/some/path';

    expect(parseArgs(urlString, dataDirString)).to.deep.equal({
      kind: 'ValidArgs',
      value: {
        url: new URL(urlString),
        dataDir: {
          kind: 'ValidDataDir',
          value: dataDirString,
        },
      },
    });
  });

  it('returns an InvalidArgs value when some of the pieces is invalid', () => {
    const invalidUrlString = 'not a real URL';

    expect(parseArgs(invalidUrlString, '/some/path')).to.deep.equal({
      kind: 'InvalidArgs',
      reason: 'Invalid RSS URL: ' + (makeRssUrl(invalidUrlString) as InvalidRssUrl).reason,
    });

    const validUrlString = 'https://example.com/feed.xml';
    const invalidDataDirString = '';

    expect(parseArgs(validUrlString, invalidDataDirString)).to.deep.equal({
      kind: 'InvalidArgs',
      reason: 'Invalid data dir: ' + (makeDataDir(invalidDataDirString) as InvalidDataDir).reason,
    });
  });
});
