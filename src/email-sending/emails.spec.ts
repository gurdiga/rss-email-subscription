import { expect } from 'chai';
import path from 'path';
import { makeDataDir, ValidDataDir } from '../shared/data-dir';
import { fileExists, FileExistsFn, readFile, ReadFileFn } from '../shared/io';

describe(getEmails.name, () => {
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as ValidDataDir;
  const mockFileExistsFn = (_filePath: string) => true;

  it('reads emails from the given dataDir', async () => {
    let actualPathArg = '';
    const mockFileContent = '["test@test.com"]';

    const mockReadFileFn = (filePath: string): string => {
      actualPathArg = filePath;
      return mockFileContent;
    };
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);

    expect(actualPathArg).to.equal(`${dataDirPathString}/emails.json`);
    expect(result).to.deep.equal({
      kind: 'RecipientList',
      emails: ['test@test.com'],
    });
  });

  it('eliminates duplicates', () => {
    // TODO
  });

  // TODO: Handle invalid emails
  // TODO: Handle empty list
  // TODO: Handle missing file
});

interface Emails {
  kind: 'RecipientList';
  emails: string[]; // TODO: Consider adding a tagged Email type?
}

interface Failure {
  kind: 'Failure';
  reason: string;
}

async function getEmails(
  dataDir: ValidDataDir,
  readFileFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): Promise<Emails | Failure> {
  const filePath = path.resolve(dataDir.value, 'emails.json');
  const emails = JSON.parse(readFileFn(filePath));

  return {
    kind: 'RecipientList',
    emails: emails,
  };
}
