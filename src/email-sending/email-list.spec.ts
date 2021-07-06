import { expect } from 'chai';
import { makeDataDir, ValidDataDir } from '../shared/data-dir';
import { fileExists, FileExistsFn, readFile, ReadFileFn } from '../shared/io';

describe(readRecipientList.name, () => {
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as ValidDataDir;
  const mockFileExistsFn = (_filePath: string) => true;

  it('reads emails from the given dataDir', async () => {
    let actualPathArg = '';
    const mockFileContent = '';

    const mockFileReaderFn = (filePath: string): string => {
      actualPathArg = filePath;
      return mockFileContent;
    };
    const result = await readRecipientList(mockDataDir, mockFileReaderFn, mockFileExistsFn);

    expect(result).to.deep.equal({
      kind: 'RecipientList',
      emails: [],
    });
  });
});

interface RecipientList {
  kind: 'RecipientList';
  emails: string[];
}

interface Failure {
  kind: 'Failure';
  reason: string;
}

async function readRecipientList(
  dataDir: ValidDataDir,
  dataReaderFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): Promise<RecipientList | Failure> {
  return {
    kind: 'RecipientList',
    emails: [],
  };
}
