import { expect } from 'chai';
import { makeDataDir } from '../shared/data-dir';
import { Err, makeErr } from '../shared/lang';
import { RssCheckingArgs, parseArgs } from './args';
import { makeRssUrl } from './rss-url';

describe(parseArgs.name, () => {
  it('returns a Args when input is valid', () => {
    const urlString = 'https://example.com/feed.xml';
    const dataDirString = '/some/path';
    const expectedResult: RssCheckingArgs = {
      kind: 'Args',
      values: [
        new URL(urlString),
        {
          kind: 'DataDir',
          value: dataDirString,
        },
      ],
    };

    expect(parseArgs(urlString, dataDirString)).to.deep.equal(expectedResult);
  });

  it('returns an Err value when some of the pieces is invalid', () => {
    const invalidUrlString = 'not a real URL';

    expect(parseArgs(invalidUrlString, '/some/path')).to.deep.equal(
      makeErr('Invalid RSS URL: ' + (makeRssUrl(invalidUrlString) as Err).reason)
    );

    const validUrlString = 'https://example.com/feed.xml';
    const invalidDataDirString = '';

    expect(parseArgs(validUrlString, invalidDataDirString)).to.deep.equal(
      makeErr('Invalid data dir: ' + (makeDataDir(invalidDataDirString) as Err).reason)
    );
  });
});
