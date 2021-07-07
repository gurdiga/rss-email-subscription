import { expect } from 'chai';
import path from 'path';
import { filterUniq } from '../shared/array-utils';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { fileExists, FileExistsFn, readFile, ReadFileFn } from '../shared/io';
import { Result } from '../shared/lang';

describe(getEmails.name, () => {
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as DataDir;
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

  describe(makeEmail.name, () => {
    it('returns an Email value from the given string', () => {
      expect(makeEmail('a@test.com')).to.deep.equal({ kind: 'Email', value: 'a@test.com' });
    });

    it('trims the whitespace', () => {
      expect(makeEmail('  a@test.com  ')).to.deep.equal({ kind: 'Email', value: 'a@test.com' });
      expect(makeEmail('	b@test.com\t\t')).to.deep.equal({ kind: 'Email', value: 'b@test.com' });
      expect(makeEmail('\r\nc@test.com ')).to.deep.equal({ kind: 'Email', value: 'c@test.com' });
    });

    it('returns an Err value when the email is invalid', () => {
      // TODO: Handle invalid emails. Check isSyntacticallyCorrectEmail in repetitor.tsx
      // https://github.com/gurdiga/repetitor.tsx/blob/master/shared/src/Model/Email.ts#L20
      // Check https://en.wikipedia.org/wiki/Email_address#Syntax
    });
  });

  // TODO: Return validEmails and invalidEmails
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

function makeEmail(email: string): Result<Email> {
  return {
    kind: 'Email',
    value: email.trim(),
  };
}

function isEmail(value: any): value is Email {
  return value.kind === 'Email';
}

async function getEmails(
  dataDir: DataDir,
  readFileFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): Promise<Result<Emails>> {
  const filePath = path.resolve(dataDir.value, 'emails.json');
  const emails = JSON.parse(readFileFn(filePath)) as string[];
  const uniqEmails = emails.filter(filterUniq).map(makeEmail).filter(isEmail);

  return {
    kind: 'RecipientList',
    emails: uniqEmails,
  };
}
