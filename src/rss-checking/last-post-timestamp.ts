import path from 'path';
import { DataDir } from '../shared/data-dir';
import { RssItem } from './rss-parsing';
import { readFile, ReadFileFn, FileExistsFn, fileExists, WriteFileFn, writeFile } from '../shared/io';
import { ArraySortFn } from '../shared/array-utils';
import { Result } from '../shared/lang';

export interface MissingTimestampFile {
  kind: 'MissingTimestampFile';
}

export function getLastPostTimestamp(
  dataDir: DataDir,
  dataReaderFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): Result<Date> | MissingTimestampFile {
  const filePath = getLastPostTimestampFileName(dataDir);

  if (!fileExistsFn(filePath)) {
    return { kind: 'MissingTimestampFile' };
  }

  try {
    const jsonString = dataReaderFn(filePath);

    try {
      const data = JSON.parse(jsonString);
      const timestamp = new Date(data.lastPostTimestamp);

      if (timestamp.toString() !== 'Invalid Date') {
        return timestamp;
      } else {
        return {
          kind: 'Err',
          reason: `Invalid timestamp in ${filePath}`,
        };
      }
    } catch (jsonParsingError) {
      return {
        kind: 'Err',
        reason: `Invalid JSON in ${filePath}`,
      };
    }
  } catch (ioError) {
    return {
      kind: 'Err',
      reason: `Can’t read ${filePath}: ${ioError.message}`,
    };
  }
}

export function recordLastPostTimestamp(
  dataDir: DataDir,
  items: RssItem[],
  writeFileFn: WriteFileFn = writeFile
): void {
  const sortByPubDateDesc: ArraySortFn<RssItem> = (a, b) => b.pubDate.getTime() - a.pubDate.getTime();
  const latestItem = [...items].sort(sortByPubDateDesc)[0];

  const filePath = getLastPostTimestampFileName(dataDir);
  const fileContent = JSON.stringify({
    lastPostTimestamp: latestItem.pubDate,
  });

  try {
    writeFileFn(filePath, fileContent);
  } catch (error) {
    throw new Error(`Cant record last post timestamp: ${error}, content: ${fileContent}`);
  }
}

function getLastPostTimestampFileName(dataDir: DataDir) {
  return path.resolve(dataDir.value, 'lastPostTimestamp.json');
}
