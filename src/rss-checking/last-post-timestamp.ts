import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { ValidDataDir } from './data-dir';

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
  fileExists: FileExistsFn = existsSync
): ValidTimestamp | InvalidTimestamp | MissingTimestampFile {
  const filePath = path.resolve(dataDir.value, 'lastPostTimestamp.json');

  if (!fileExists(filePath)) {
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
