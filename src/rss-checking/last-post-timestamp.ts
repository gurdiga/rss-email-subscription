import path from 'path';
import { ValidDataDir } from '../shared/data-dir';
import { RssItem } from './rss-parsing';
import { readFile, ReadFileFn, FileExistsFn, fileExists, WriteFileFn, writeFile } from '../shared/io';
import { ArraySortFn } from '../shared/array-utils';

interface ValidTimestamp {
  kind: 'ValidTimestamp';
  value: Date;
}

interface InvalidTimestamp {
  kind: 'InvalidTimestamp';
  reason: string;
}

interface MissingTimestampFile {
  kind: 'MissingTimestampFile';
}

export function getLastPostTimestamp(
  dataDir: ValidDataDir,
  dataReaderFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): ValidTimestamp | InvalidTimestamp | MissingTimestampFile {
  const filePath = getLastPostTimestampFileName(dataDir);

  if (!fileExistsFn(filePath)) {
    return {
      kind: 'MissingTimestampFile',
    };
  }

  try {
    const jsonString = dataReaderFn(filePath);

    try {
      const data = JSON.parse(jsonString);
      const timestamp = new Date(data.lastPostTimestamp);

      if (timestamp.toString() !== 'Invalid Date') {
        return {
          kind: 'ValidTimestamp',
          value: timestamp,
        };
      } else {
        return {
          kind: 'InvalidTimestamp',
          reason: `Invalid timestamp in ${filePath}`,
        };
      }
    } catch (jsonParsingError) {
      return {
        kind: 'InvalidTimestamp',
        reason: `Invalid JSON in ${filePath}`,
      };
    }
  } catch (ioError) {
    return {
      kind: 'InvalidTimestamp',
      reason: `Can’t read ${filePath}: ${ioError.message}`,
    };
  }
}

export function recordLastPostTimestamp(
  dataDir: ValidDataDir,
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

function getLastPostTimestampFileName(dataDir: ValidDataDir) {
  return path.resolve(dataDir.value, 'lastPostTimestamp.json');
}
