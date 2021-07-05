import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { ValidDataDir } from './data-dir';
import { RssItem } from './rss-parsing';
import { writeFile, WriteFileFn } from './new-item-recording';

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

type DataReaderFn = (filePath: string) => string;
type FileExistsFn = (filePath: string) => boolean;

export function getLastPostTimestamp(
  dataDir: ValidDataDir,
  dataReaderFn: DataReaderFn = dataReader,
  fileExistsFn: FileExistsFn = existsSync
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

function dataReader(path: string) {
  return readFileSync(path, 'utf8');
}

export function recordLastPostTimestamp(
  dataDir: ValidDataDir,
  items: RssItem[],
  writeFileFn: WriteFileFn = writeFile
): void {
  const sortByPubDateDesc: ArraySortFn<RssItem> = (a, b) => b.pubDate.getTime() - a.pubDate.getTime();
  const latestItem = [...items].sort(sortByPubDateDesc)[0];

  writeFileFn(
    getLastPostTimestampFileName(dataDir),
    JSON.stringify({
      lastPostTimestamp: latestItem.pubDate,
    })
  );
}

type ArraySortFn<T> = (a: T, b: T) => number;

function getLastPostTimestampFileName(dataDir: ValidDataDir) {
  return path.resolve(dataDir.value, 'lastPostTimestamp.json');
}
