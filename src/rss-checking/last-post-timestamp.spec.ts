import { expect } from 'chai';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { FileExistsFn, ReadFileFn, WriteFileFn } from '../shared/io';
import { makeErr } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { makeSpy, makeStub, makeThrowingStub } from '../shared/test-utils';
import { getLastPostMetadata, LastPostMetadata, recordLastPostMetadata } from './last-post-timestamp';

describe('Last post timestamp', () => {
  const aTimestamp = new Date();
  const aGuid = 'some-GUID-string';
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as DataDir;

  describe(getLastPostMetadata.name, () => {
    const fileExistsFn = makeStub<FileExistsFn>(() => true);

    it('returns the Date and GUID recorded in lastPostMetadata.json in dataDir', () => {
      const lastPostMetadata: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: aGuid,
      };
      const fileReaderFn = makeStub<ReadFileFn>(() => JSON.stringify(lastPostMetadata));
      const result = getLastPostMetadata(mockDataDir, fileReaderFn, fileExistsFn);

      const expectedResult: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: aGuid,
      };

      expect(result).to.deep.equal(expectedResult);
      expect(fileReaderFn.calls).to.deep.equal([[`${dataDirPathString}/lastPostMetadata.json`]]);
    });

    it('returns an Err value when can’t read lastPostMetadata.json', () => {
      const fileReaderFn = makeThrowingStub<ReadFileFn>(new Error('Some IO error?!'));
      const result = getLastPostMetadata(mockDataDir, fileReaderFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr(`Can’t read ${dataDirPathString}/lastPostMetadata.json: Some IO error?!`));
    });

    it('returns undefined value when lastPostMetadata.json does not exist', () => {
      const fileExistsFn = makeStub<FileExistsFn>(() => false);
      const result = getLastPostMetadata(mockDataDir, undefined, fileExistsFn);

      expect(result).to.be.undefined;
    });

    it('returns an Err value when lastPostMetadata.json does not contain valid JSON', () => {
      const nonJsonString = 'not a valid JSON string';
      const fileReaderFn = makeStub<ReadFileFn>(() => nonJsonString);
      const result = getLastPostMetadata(mockDataDir, fileReaderFn, fileExistsFn);

      expect(result).to.deep.equal(
        makeErr(`Invalid JSON in ${dataDirPathString}/lastPostMetadata.json: ${nonJsonString}`)
      );
    });

    it('returns an Err value when the timestamp in lastPostMetadata.json is not a valid date', () => {
      const fileReaderFn = makeStub<ReadFileFn>(() => '{"lastPostTimestamp": "not a JSON date"}');
      const result = getLastPostMetadata(mockDataDir, fileReaderFn, fileExistsFn);

      expect(result).to.deep.equal(makeErr(`Invalid timestamp in ${dataDirPathString}/lastPostMetadata.json`));
    });

    it('defaults guid to empty string', () => {
      const lastPostMetadata: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: undefined as any as string,
      };
      const fileReaderFn = makeStub<ReadFileFn>(() => JSON.stringify(lastPostMetadata));
      const result = getLastPostMetadata(mockDataDir, fileReaderFn, fileExistsFn);

      const expectedResult: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: '',
      };

      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe(recordLastPostMetadata.name, () => {
    const mockRssItems: RssItem[] = [
      {
        title: 'Item one',
        content: 'The content of item one.',
        author: 'John DOE',
        pubDate: new Date('2020-01-02T10:50:16-06:00'),
        link: new URL('https://test.com/item-one'),
        guid: '1',
      },
      {
        title: 'Item two',
        content: 'The content of item two.',
        author: 'John DOE',
        pubDate: new Date('2020-01-03T10:50:16-06:00'),
        link: new URL('https://test.com/item-two'),
        guid: '2',
      },
      {
        title: 'Item three',
        content: 'The content of item three.',
        author: 'John DOE',
        pubDate: new Date('2020-01-04T10:50:16-06:00'),
        link: new URL('https://test.com/item-three'),
        guid: '3',
      },
    ];

    const latestPost = mockRssItems[2];
    const expectedLastPostMetadata: LastPostMetadata = {
      pubDate: latestPost.pubDate,
      guid: latestPost.guid,
    };
    const expectedFileContent = JSON.stringify(expectedLastPostMetadata);

    it('writes pubDate of the latest item to lastPostMetadata.json', () => {
      const writeFileFn = makeSpy<WriteFileFn>();
      const initialRssItems = [...mockRssItems];

      const result = recordLastPostMetadata(mockDataDir, mockRssItems, writeFileFn);

      expect(mockRssItems).to.deep.equal(initialRssItems, 'Does not alter the input array');
      expect(writeFileFn.calls).to.deep.equal([[`${mockDataDir.value}/lastPostMetadata.json`, expectedFileContent]]);
      expect(result).to.deep.equal(expectedLastPostMetadata);
    });

    it('reports the error when can’t write file', () => {
      const mockError = new Error('No write access');
      const writeFileFn = makeThrowingStub<WriteFileFn>(mockError);
      const result = recordLastPostMetadata(mockDataDir, mockRssItems, writeFileFn);

      expect(result).to.deep.equal(
        makeErr(`Cant record last post timestamp: ${mockError}, content: ${expectedFileContent}`)
      );
    });

    it('does nothing when there are no items', () => {
      const writeFileFn = makeSpy<WriteFileFn>();
      const newRssItems: RssItem[] = [];

      recordLastPostMetadata(mockDataDir, newRssItems, writeFileFn);

      expect(writeFileFn.calls).to.be.empty;
    });
  });
});
