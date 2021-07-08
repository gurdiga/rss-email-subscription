import { expect } from 'chai';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { makeErr } from '../shared/lang';
import { Email, EmailList, getEmails, makeEmail } from './emails';

describe(getEmails.name, () => {
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as DataDir;
  const mockFileExistsFn = (_filePath: string) => true;

  it('reads emails from the given dataDir', async () => {
    let actualPathArg = '';
    const mockReadFileFn = (filePath: string): string => {
      actualPathArg = filePath;
      return '["test@test.com"]';
    };
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);

    expect(actualPathArg).to.equal(`${dataDirPathString}/emails.json`);
    expect(result).to.deep.equal({
      kind: 'EmailList',
      emails: [{ kind: 'Email', value: 'test@test.com' }],
    } as EmailList);
  });

  it('eliminates duplicates', async () => {
    const mockFileContent = JSON.stringify(['a@test.com', 'a@test.com', 'b@test.com', 'b@test.com', 'b@test.com']);
    const mockReadFileFn = () => mockFileContent;
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);

    expect(result).to.deep.equal({
      kind: 'EmailList',
      emails: [
        { kind: 'Email', value: 'a@test.com' },
        { kind: 'Email', value: 'b@test.com' },
      ],
    } as EmailList);
  });

  it('returns valid and invalid emails separately', async () => {
    const mockFileContent = JSON.stringify(['a@test.com', '+@test.com', 'b@test', 'b@test.com']);
    const mockReadFileFn = () => mockFileContent;
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);

    expect(result).to.deep.equal({
      kind: 'EmailList',
      emails: [
        { kind: 'Email', value: 'a@test.com' },
        { kind: 'Email', value: 'b@test.com' },
      ],
    } as EmailList);
  });

  // TODO: Return validEmails and invalidEmails
  // TODO: Handle empty list
  // TODO: Handle missing file

  describe(makeEmail.name, () => {
    it('returns an Email value from the given string', () => {
      expect(makeEmail('a@test.com')).to.deep.equal({ kind: 'Email', value: 'a@test.com' } as Email);
      expect(makeEmail('23@test.com')).to.deep.equal({ kind: 'Email', value: '23@test.com' } as Email);
    });

    it('accepts “plus addressing”', () => {
      expect(makeEmail('a+1@test.com')).to.deep.equal({ kind: 'Email', value: 'a+1@test.com' } as Email);
    });

    it('trims the whitespace', () => {
      expect(makeEmail('  a@test.com  ')).to.deep.equal({ kind: 'Email', value: 'a@test.com' } as Email);
      expect(makeEmail('	b@test.com\t\t')).to.deep.equal({ kind: 'Email', value: 'b@test.com' } as Email);
      expect(makeEmail('\r\nc@test.com ')).to.deep.equal({ kind: 'Email', value: 'c@test.com' } as Email);
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
});
