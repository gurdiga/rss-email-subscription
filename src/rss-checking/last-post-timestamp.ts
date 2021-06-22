import path from 'path';
import { readFileSync } from 'fs';
import { ValidDataDir } from './data-dir';

interface ValidTimestamp {
  kind: 'ValidTimestamp';
  value: Date;
}

interface InvalidTimestamp {
  kind: 'InvalidTimestamp';
  reason: string;
}

type DataReaderFn = (filePath: string) => string;

export function getLastPostTimestamp(
  dataDir: ValidDataDir,
  dataReaderFn: DataReaderFn = dataReader
): ValidTimestamp | InvalidTimestamp {
  const filePath = path.resolve(dataDir.value, 'lastPostTimestamp.json');

  try {
    const jsonString = dataReaderFn(filePath);

    try {
      const data = JSON.parse(jsonString);

      return {
        kind: 'ValidTimestamp',
        value: new Date(data.lastPostTimestamp),
      };
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
  return readFileSync(path, 'utf-8');
}
