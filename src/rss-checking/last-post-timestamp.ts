import path from 'path';
import { DataDir } from '../shared/data-dir';
import { RssItem } from '../shared/rss-item';
import { readFile, ReadFileFn, FileExistsFn, fileExists, WriteFileFn, writeFile } from '../shared/io';
import { isEmpty, sortBy, SortDirection } from '../shared/array-utils';
import { getErrorMessage, makeErr, Result } from '../shared/lang';

export function getLastPostTimestamp(
  dataDir: DataDir,
  dataReaderFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): Result<Date | undefined> {
  const filePath = getLastPostTimestampFileName(dataDir);

  if (!fileExistsFn(filePath)) {
    return;
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
    return makeErr(`Can’t read ${filePath}: ${getErrorMessage(ioError)}`);
  }
}

export function recordLastPostTimestamp(
  dataDir: DataDir,
  items: RssItem[],
  writeFileFn: WriteFileFn = writeFile
): Result<void> {
  if (isEmpty(items)) {
    return;
  }

  const latestItem = [...items].sort(sortBy((i) => i.pubDate, SortDirection.Desc))[0];

  const filePath = getLastPostTimestampFileName(dataDir);
  const fileContent = JSON.stringify({
    lastPostTimestamp: latestItem.pubDate,
  });

  try {
    writeFileFn(filePath, fileContent);
  } catch (error) {
    return makeErr(`Cant record last post timestamp: ${error}, content: ${fileContent}`);
  }
}

function getLastPostTimestampFileName(dataDir: DataDir) {
  return path.join(dataDir.value, 'lastPostTimestamp.json');
}
