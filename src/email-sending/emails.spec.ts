import { expect } from 'chai';
import path from 'path';
import { filterUniq } from '../shared/array-utils';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { fileExists, FileExistsFn, readFile, ReadFileFn } from '../shared/io';
import { makeErr, Result } from '../shared/lang';

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
      expect(makeEmail('23@test.com')).to.deep.equal({ kind: 'Email', value: '23@test.com' });
    });

    it('accepts “plus addressing”', () => {
      expect(makeEmail('a+1@test.com')).to.deep.equal({ kind: 'Email', value: 'a+1@test.com' });
    });

    it('trims the whitespace', () => {
      expect(makeEmail('  a@test.com  ')).to.deep.equal({ kind: 'Email', value: 'a@test.com' });
      expect(makeEmail('	b@test.com\t\t')).to.deep.equal({ kind: 'Email', value: 'b@test.com' });
      expect(makeEmail('\r\nc@test.com ')).to.deep.equal({ kind: 'Email', value: 'c@test.com' });
    });

    it('returns an Err value when the email is invalid', () => {
      expect(makeEmail('')).to.deep.equal(makeErr('Syntactically invalid email: ""'));
      expect(makeEmail(' \r\n\t')).to.deep.equal(makeErr('Syntactically invalid email: " \r\n\t"'));
      expect(makeEmail('@test.com')).to.deep.equal(makeErr('Syntactically invalid email: "@test.com"'));
      expect(makeEmail('a+@test.com')).to.deep.equal(makeErr('Syntactically invalid email: "a+@test.com"'));
      expect(makeEmail('a++2@test.com')).to.deep.equal(makeErr('Syntactically invalid email: "a++2@test.com"'));
      expect(makeEmail('++2@test.com')).to.deep.equal(makeErr('Syntactically invalid email: "++2@test.com"'));
      expect(makeEmail('a@test')).to.deep.equal(makeErr('Syntactically invalid email: "a@test"'));
      expect(makeEmail('a@too-short-tld.i')).to.deep.equal(makeErr('Syntactically invalid email: "a@too-short-tld.i"'));
      expect(makeEmail('a@bad.')).to.deep.equal(makeErr('Syntactically invalid email: "a@bad."'));
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

function makeEmail(emailString: string): Result<Email> {
  const email = emailString.trim();
  const err = makeErr(`Syntactically invalid email: "${emailString}"`);

  if (!email) {
    return err;
  }

  const keyCharacters = ['.', '@'];
  const containsKeyCharacters = keyCharacters.every((c) => !!emailString && emailString.includes(c));

  if (!containsKeyCharacters) {
    return err;
  }

  const sides = emailString.split('@');
  const [localPart, domain] = sides.map((s) => s.trim());
  const doesLocalPartLookReasonable = localPart.length > 0 && /^[a-z0-9]+((\+)?[a-z0-9]+)*$/i.test(localPart);

  if (!doesLocalPartLookReasonable) {
    return err;
  }

  const domainLevels = domain.split(/\./).reverse();
  const doDomainPartsLookReasonable = /[a-z]{2,}/i.test(domainLevels[0]) && domainLevels.every((l) => l.length >= 1);

  if (!doDomainPartsLookReasonable) {
    return err;
  }

  return {
    kind: 'Email',
    value: email,
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
