import { expect } from 'chai';
import path from 'path';
import { filterUniq } from '../shared/array-utils';
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
      emails: [{ kind: 'Email', value: 'test@test.com' }],
    });
  });

  it('eliminates duplicates', async () => {
    const mockFileContent = JSON.stringify(['a@test.com', 'a@test.com', 'b@test.com', 'b@test.com', 'b@test.com']);
    const mockReadFileFn = () => mockFileContent;
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);

    expect(result).to.deep.equal({
      kind: 'RecipientList',
      emails: [
        { kind: 'Email', value: 'a@test.com' },
        { kind: 'Email', value: 'b@test.com' },
      ],
    });
  });

  it('trims emails', async () => {
    const mockFileContent = JSON.stringify(['  a@test.com  ', '	b@test.com		', '\r\nc@test.com']);
    const mockReadFileFn = () => mockFileContent;
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);

    expect(result).to.deep.equal({
      kind: 'RecipientList',
      emails: [
        { kind: 'Email', value: 'a@test.com' },
        { kind: 'Email', value: 'b@test.com' },
        { kind: 'Email', value: 'c@test.com' },
      ],
    });
  });

  // TODO: Handle invalid emails
  // TODO: Handle empty list
  // TODO: Handle missing file
});

interface Emails {
  kind: 'RecipientList';
  emails: Email[];
}

interface Email {
  kind: 'Email';
  value: string;
}

// TODO: Add unit test
function makeEmail(email: string): Email {
  return {
    kind: 'Email',
    value: email,
  };
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
  const emails = JSON.parse(readFileFn(filePath)) as string[];
  const uniqEmails = emails
    .filter(filterUniq)
    .map((e) => e.trim())
    .map(makeEmail);

  return {
    kind: 'RecipientList',
    emails: uniqEmails,
  };
}
