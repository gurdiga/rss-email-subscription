import { expect } from 'chai';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { Err } from '../shared/lang';
import { getLastPostTimestamp, MissingTimestampFile, recordLastPostTimestamp } from './last-post-timestamp';
import { RssItem } from './rss-parsing';

describe('Last post timestamp', () => {
  const aTimestamp = new Date();
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as DataDir;

  describe(getLastPostTimestamp.name, () => {
    const mockFileExistsFn = (_filePath: string) => true;

    it('returns the Date recorded in lastPostTimestamp.json in dataDir', () => {
      let actualPathArg = '';

      const mockFileReaderFn = (filePath: string): string => {
        actualPathArg = filePath;

        const mockFileContent = JSON.stringify({ lastPostTimestamp: aTimestamp });
        return mockFileContent;
      };
      const result = getLastPostTimestamp(mockDataDir, mockFileReaderFn, mockFileExistsFn);

      expect(result).to.deep.equal(aTimestamp);
      expect(actualPathArg).to.equal(`${dataDirPathString}/lastPostTimestamp.json`);
    });

    it('returns an Err value when can’t read lastPostTimestamp.json', () => {
      const mockFileReaderFn = (_filePath: string) => {
        throw new Error('Some IO error?!');
      };
      const result = getLastPostTimestamp(mockDataDir, mockFileReaderFn, mockFileExistsFn);

      expect(result).to.deep.equal({
        kind: 'Err',
        reason: `Can’t read ${dataDirPathString}/lastPostTimestamp.json: Some IO error?!`,
      } as Err);
    });

    it('returns an Err value when lastPostTimestamp.json does not exist', () => {
      const mockFileExistsFn = (_filePath: string) => false;
      const result = getLastPostTimestamp(mockDataDir, undefined, mockFileExistsFn);

      expect(result).to.deep.equal({
        kind: 'MissingTimestampFile',
      } as MissingTimestampFile);
    });

    it('returns an Err value when lastPostTimestamp.json does not contain valid JSON', () => {
      const mockFileReaderFn = (_filePath: string) => {
        return 'not a valid JSON string';
      };
      const result = getLastPostTimestamp(mockDataDir, mockFileReaderFn, mockFileExistsFn);

      expect(result).to.deep.equal({
        kind: 'Err',
        reason: `Invalid JSON in ${dataDirPathString}/lastPostTimestamp.json`,
      } as Err);
    });

    it('returns an Err value when the timestamp in lastPostTimestamp.json is not a valid date', () => {
      const mockFileReaderFn = (_filePath: string) => {
        return '{"lastPostTimestamp": "not a JSON date"}';
      };
      const result = getLastPostTimestamp(mockDataDir, mockFileReaderFn, mockFileExistsFn);

      expect(result).to.deep.equal({
        kind: 'Err',
        reason: `Invalid timestamp in ${dataDirPathString}/lastPostTimestamp.json`,
      } as Err);
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

    const expectedFileContent = JSON.stringify({
      lastPostTimestamp: mockRssItems[2].pubDate,
    });

    it('writes pubDate of the latest item to data/lastPostTimestamp.json', () => {
      const writtenFiles: { path: string; content: string }[] = [];
      const mockWriteFile = (path: string, content: string) => writtenFiles.push({ path, content });
      const initialRssItems = [...mockRssItems];

      recordLastPostTimestamp(mockDataDir, mockRssItems, mockWriteFile);

      expect(mockRssItems).to.deep.equal(initialRssItems, 'Does not alter the input array');
      expect(writtenFiles).to.deep.equal([
        {
          path: `${mockDataDir.value}/lastPostTimestamp.json`,
          content: expectedFileContent,
        },
      ]);
    });

    it('reports the error when can’t write file', () => {
      const mockError = new Error('No write access');
      const mockWriteFile = (_path: string, _content: string) => {
        throw mockError;
      };

      expect(() => {
        recordLastPostTimestamp(mockDataDir, mockRssItems, mockWriteFile);
      }).to.throw(`Cant record last post timestamp: ${mockError}, content: ${expectedFileContent}`);
    });
  });
});
