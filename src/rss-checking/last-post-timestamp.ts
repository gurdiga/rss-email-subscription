import path from 'path';
import { DataDir } from '../shared/data-dir';
import { RssItem } from '../shared/rss-item';
import { readFile, ReadFileFn, FileExistsFn, fileExists, WriteFileFn, writeFile } from '../shared/io';
import { ArraySortFn } from '../shared/array-utils';
import { makeErr, Result } from '../shared/lang';

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
        return makeErr(`Invalid timestamp in ${filePath}`);
      }
    } catch (jsonParsingError) {
      return makeErr(`Invalid JSON in ${filePath}`);
    }
  } catch (ioError) {
    return makeErr(`Can’t read ${filePath}: ${ioError.message}`);
  }
}

export function recordLastPostTimestamp(
  dataDir: DataDir,
  items: RssItem[],
  writeFileFn: WriteFileFn = writeFile
): void {
  if (items.length === 0) {
    return;
  }

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
