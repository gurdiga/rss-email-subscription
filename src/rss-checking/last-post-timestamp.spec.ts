import { expect } from 'chai';
import { makeDataDir, ValidDataDir } from './data-dir';
import { getLastPostTimestamp } from './last-post-timestamp';

describe(getLastPostTimestamp.name, () => {
  const aTimestamp = new Date();
  const dataDirPathString = '/some/path';
  const dataDir = makeDataDir(dataDirPathString) as ValidDataDir;

  it('returns a ValidTimestamp value with the date recorded in lastPostTimestamp.json in dataDir', () => {
    let actualPathArg = '';

    const mockFileReaderFn = (filePath: string): string => {
      actualPathArg = filePath;

      const mockFileContent = JSON.stringify({ lastPostTimestamp: aTimestamp });
      return mockFileContent;
    };
    const result = getLastPostTimestamp(dataDir, mockFileReaderFn);

    expect(result).to.deep.equal({
      kind: 'ValidTimestamp',
      value: aTimestamp,
    });

    expect(actualPathArg).to.equal(`${dataDirPathString}/lastPostTimestamp.json`);
  });

  it('returns an InvalidTimestamp value when can’t read lastPostTimestamp.json', () => {
    const mockFileReaderFn = (_filePath: string) => {
      throw new Error('Some IO error?!');
    };
    const result = getLastPostTimestamp(dataDir, mockFileReaderFn);

    expect(result).to.deep.equal({
      kind: 'InvalidTimestamp',
      reason: `Can’t read ${dataDirPathString}/lastPostTimestamp.json: Some IO error?!`,
    });
  });

  it('returns an InvalidTimestamp value when lastPostTimestamp.json does not contain valid JSON', () => {
    const mockFileReaderFn = (_filePath: string) => {
      return 'not a valid JSON string';
    };
    const result = getLastPostTimestamp(dataDir, mockFileReaderFn);

    expect(result).to.deep.equal({
      kind: 'InvalidTimestamp',
      reason: `Invalid JSON in ${dataDirPathString}/lastPostTimestamp.json`,
    });
  });

  it('returns an InvalidTimestamp value when the timestamp in lastPostTimestamp.json is not a valid date', () => {
    const mockFileReaderFn = (_filePath: string) => {
      return '{"lastPostTimestamp": "not a JSON date"}';
    };
    const result = getLastPostTimestamp(dataDir, mockFileReaderFn);

    expect(result).to.deep.equal({
      kind: 'InvalidTimestamp',
      reason: `Invalid timestamp in ${dataDirPathString}/lastPostTimestamp.json`,
    });
  });
});
