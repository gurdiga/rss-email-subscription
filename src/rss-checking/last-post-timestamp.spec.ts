import { expect } from 'chai';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { makeErr } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { getLastPostTimestamp, recordLastPostTimestamp } from './last-post-timestamp';

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

      expect(result).to.deep.equal(makeErr(`Can’t read ${dataDirPathString}/lastPostTimestamp.json: Some IO error?!`));
    });

    it('returns undefined value when lastPostTimestamp.json does not exist', () => {
      const mockFileExistsFn = (_filePath: string) => false;
      const result = getLastPostTimestamp(mockDataDir, undefined, mockFileExistsFn);

      expect(result).to.be.undefined;
    });

    it('returns an Err value when lastPostTimestamp.json does not contain valid JSON', () => {
      const mockFileReaderFn = (_filePath: string) => {
        return 'not a valid JSON string';
      };
      const result = getLastPostTimestamp(mockDataDir, mockFileReaderFn, mockFileExistsFn);

      expect(result).to.deep.equal(makeErr(`Invalid JSON in ${dataDirPathString}/lastPostTimestamp.json`));
    });

    it('returns an Err value when the timestamp in lastPostTimestamp.json is not a valid date', () => {
      const mockFileReaderFn = (_filePath: string) => {
        return '{"lastPostTimestamp": "not a JSON date"}';
      };
      const result = getLastPostTimestamp(mockDataDir, mockFileReaderFn, mockFileExistsFn);

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
      const writtenFiles: { path: string; content: string }[] = [];
      const mockWriteFile = (path: string, content: string) => writtenFiles.push({ path, content });
      const initialRssItems = [...mockRssItems];

      const result = recordLastPostTimestamp(mockDataDir, mockRssItems, mockWriteFile);

      expect(mockRssItems).to.deep.equal(initialRssItems, 'Does not alter the input array');
      expect(writtenFiles).to.deep.equal([
        {
          path: `${mockDataDir.value}/lastPostTimestamp.json`,
          content: expectedFileContent,
        },
      ]);

      expect(result).to.equal(lastPostTimestamp);
    });

    it('reports the error when can’t write file', () => {
      const mockError = new Error('No write access');
      const mockWriteFile = (_path: string, _content: string) => {
        throw mockError;
      };

      const result = recordLastPostTimestamp(mockDataDir, mockRssItems, mockWriteFile);

      expect(result).to.deep.equal(
        makeErr(`Cant record last post timestamp: ${mockError}, content: ${expectedFileContent}`)
      );
    });

    it('does nothing when there are no items', () => {
      const writtenFiles: { path: string; content: string }[] = [];
      const mockWriteFile = (path: string, content: string) => writtenFiles.push({ path, content });
      const newRssItems: RssItem[] = [];

      recordLastPostTimestamp(mockDataDir, newRssItems, mockWriteFile);

      expect(writtenFiles).to.deep.equal([]);
    });
  });
});
