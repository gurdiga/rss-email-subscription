import { expect } from 'chai';
import { makeDataDir } from '../shared/data-dir';
import { Err } from '../shared/lang';
import { parseArgs } from './args';
import { makeRssUrl } from './rss-url';

describe(parseArgs.name, () => {
  it('returns a Args when input is valid', () => {
    const urlString = 'https://example.com/feed.xml';
    const dataDirString = '/some/path';

    expect(parseArgs(urlString, dataDirString)).to.deep.equal({
      kind: 'Args',
      value: {
        url: new URL(urlString),
        dataDir: {
          kind: 'DataDir',
          value: dataDirString,
        },
      },
    });
  });

  it('returns an Err value when some of the pieces is invalid', () => {
    const invalidUrlString = 'not a real URL';

    expect(parseArgs(invalidUrlString, '/some/path')).to.deep.equal({
      kind: 'Err',
      reason: 'Invalid RSS URL: ' + (makeRssUrl(invalidUrlString) as Err).reason,
    } as Err);

    const validUrlString = 'https://example.com/feed.xml';
    const invalidDataDirString = '';

    expect(parseArgs(validUrlString, invalidDataDirString)).to.deep.equal({
      kind: 'Err',
      reason: 'Invalid data dir: ' + (makeDataDir(invalidDataDirString) as Err).reason,
    } as Err);
  });
});
