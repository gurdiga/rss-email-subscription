import { expect } from 'chai';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { FileExistsFn, ReadFileFn, WriteFileFn } from '../shared/io';
import { makeErr } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { makeSpy, makeStub, makeThrowingStub } from '../shared/test-utils';
import { getLastPostTimestamp, recordLastPostTimestamp } from './last-post-timestamp';

describe('Last post timestamp', () => {
  const aTimestamp = new Date();
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as DataDir;

  describe(getLastPostTimestamp.name, () => {
    const fileExistsFn = makeStub<FileExistsFn>(() => true);

    it('returns the Date recorded in lastPostTimestamp.json in dataDir', () => {
      const fileReaderFn = makeStub<ReadFileFn>(() => {
        return JSON.stringify({ lastPostTimestamp: aTimestamp });
      });
      const result = getLastPostTimestamp(mockDataDir, fileReaderFn, fileExistsFn);

      expect(result).to.deep.equal(aTimestamp);
      expect(fileReaderFn.calls).to.deep.equal([[`${dataDirPathString}/lastPostTimestamp.json`]]);
    });

    it('returns an Err value when can’t read lastPostTimestamp.json', () => {
      const fileReaderFn = makeThrowingStub<ReadFileFn>(new Error('Some IO error?!'));
      const result = getLastPostTimestamp(mockDataDir, fileReaderFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr(`Can’t read ${dataDirPathString}/lastPostTimestamp.json: Some IO error?!`));
    });

    it('returns undefined value when lastPostTimestamp.json does not exist', () => {
      const fileExistsFn = makeStub<FileExistsFn>(() => false);
      const result = getLastPostTimestamp(mockDataDir, undefined, fileExistsFn);

      expect(result).to.be.undefined;
    });

    it('returns an Err value when lastPostTimestamp.json does not contain valid JSON', () => {
      const fileReaderFn = makeStub<ReadFileFn>(() => 'not a valid JSON string');
      const result = getLastPostTimestamp(mockDataDir, fileReaderFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr(`Invalid JSON in ${dataDirPathString}/lastPostTimestamp.json`));
    });

    it('returns an Err value when the timestamp in lastPostTimestamp.json is not a valid date', () => {
      const fileReaderFn = makeStub<ReadFileFn>(() => '{"lastPostTimestamp": "not a JSON date"}');
      const result = getLastPostTimestamp(mockDataDir, fileReaderFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr(`Invalid timestamp in ${dataDirPathString}/lastPostTimestamp.json`));
    });
  });

  describe(recordLastPostTimestamp.name, () => {
    const mockRssItems: RssItem[] = [
      {
        title: 'Item one',
        content: 'The content of item one.',
        author: 'John DOE',
        pubDate: new Date('2020-01-02T10:50:16-06:00'),
        link: new URL('https://test.com/item-one'),
      },
      {
        title: 'Item two',
        content: 'The content of item two.',
        author: 'John DOE',
        pubDate: new Date('2020-01-03T10:50:16-06:00'),
        link: new URL('https://test.com/item-two'),
      },
      {
        title: 'Item three',
        content: 'The content of item three.',
        author: 'John DOE',
        pubDate: new Date('2020-01-04T10:50:16-06:00'),
        link: new URL('https://test.com/item-three'),
      },
    ];

    const lastPostTimestamp = mockRssItems[2].pubDate;
    const expectedFileContent = JSON.stringify({
      lastPostTimestamp,
    });

    it('writes pubDate of the latest item to lastPostTimestamp.json', () => {
      const writeFileFn = makeSpy<WriteFileFn>();
      const initialRssItems = [...mockRssItems];

      const result = recordLastPostTimestamp(mockDataDir, mockRssItems, writeFileFn);

      expect(mockRssItems).to.deep.equal(initialRssItems, 'Does not alter the input array');
      expect(writeFileFn.calls).to.deep.equal([[`${mockDataDir.value}/lastPostTimestamp.json`, expectedFileContent]]);
      expect(result).to.equal(lastPostTimestamp);
    });

    it('reports the error when can’t write file', () => {
      const mockError = new Error('No write access');
      const writeFileFn = makeThrowingStub<WriteFileFn>(mockError);
      const result = recordLastPostTimestamp(mockDataDir, mockRssItems, writeFileFn);

      expect(result).to.deep.equal(
        makeErr(`Cant record last post timestamp: ${mockError}, content: ${expectedFileContent}`)
      );
    });

    it('does nothing when there are no items', () => {
      const writeFileFn = makeSpy<WriteFileFn>();
      const newRssItems: RssItem[] = [];

      recordLastPostTimestamp(mockDataDir, newRssItems, writeFileFn);

      expect(writeFileFn.calls).to.be.empty;
    });
  });
});
