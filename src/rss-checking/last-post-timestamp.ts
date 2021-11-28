import path from 'path';
import { DataDir } from '../shared/data-dir';
import { RssItem } from '../shared/rss-item';
import { readFile, ReadFileFn, FileExistsFn, fileExists, WriteFileFn, writeFile } from '../shared/io';
import { isEmpty, sortBy, SortDirection } from '../shared/array-utils';
import { getErrorMessage, makeErr, Result } from '../shared/lang';

export function getLastPostMetadata(
  dataDir: DataDir,
  dataReaderFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): Result<LastPostMetadata | undefined> {
  const filePath = getLastPostMetadataFileName(dataDir);

  if (!fileExistsFn(filePath)) {
    return;
  }

  try {
    const jsonString = dataReaderFn(filePath);

    try {
      const data = JSON.parse(jsonString);
      const timestamp = new Date(data.lastPostTimestamp);

      if (timestamp.toString() === 'Invalid Date') {
        return makeErr(`Invalid timestamp in ${filePath}`);
      }

      const { guid = '' } = data;

      return {
        lastPostTimestamp: timestamp,
        guid,
      };
    } catch (jsonParsingError) {
      return makeErr(`Invalid JSON in ${filePath}`);
    }
  } catch (ioError) {
    return makeErr(`Can’t read ${filePath}: ${getErrorMessage(ioError)}`);
  }
}

export interface LastPostMetadata {
  lastPostTimestamp: Date;
  guid: string;
}

export function recordLastPostMetadata(
  dataDir: DataDir,
  items: RssItem[],
  writeFileFn: WriteFileFn = writeFile
): Result<LastPostMetadata | undefined> {
  if (isEmpty(items)) {
    return;
  }

  const latestItem = [...items].sort(sortBy((i) => i.pubDate, SortDirection.Desc))[0];
  const metadata: LastPostMetadata = {
    lastPostTimestamp: latestItem.pubDate,
    guid: latestItem.guid,
  };

  const filePath = getLastPostMetadataFileName(dataDir);
  const fileContent = JSON.stringify(metadata);

  try {
    writeFileFn(filePath, fileContent);

    return metadata;
  } catch (error) {
    return makeErr(`Cant record last post timestamp: ${error}, content: ${fileContent}`);
  }
}

function getLastPostMetadataFileName(dataDir: DataDir) {
  return path.join(dataDir.value, 'lastPostMetadata.json');
}
