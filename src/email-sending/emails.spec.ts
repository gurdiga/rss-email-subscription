import { expect } from 'chai';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { readFile } from '../shared/io';
import { makeErr } from '../shared/lang';
import { EmailAddress, EmailList, getEmails, makeEmailAddress } from './emails';

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
    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [{ kind: 'EmailAddress', value: 'test@test.com' }],
      invalidEmails: [],
    };

    expect(actualPathArg).to.equal(`${dataDirPathString}/emails.json`);
    expect(result).to.deep.equal(expectedResult);
  });

  it('eliminates duplicates', async () => {
    const mockFileContent = JSON.stringify(['a@test.com', 'a@test.com', ' b@test.com', 'b@test.com', 'b@test.com']);
    const mockReadFileFn = () => mockFileContent;
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);
    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [
        { kind: 'EmailAddress', value: 'a@test.com' },
        { kind: 'EmailAddress', value: 'b@test.com' },
      ],
      invalidEmails: [],
    };

    expect(result).to.deep.equal(expectedResult as EmailList);
  });

  it('returns valid and invalid emails separately', async () => {
    const mockFileContent = JSON.stringify(['a@test.com', '+@test.com', 'b@test', 'b@test.com']);
    const mockReadFileFn = () => mockFileContent;
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);
    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [
        { kind: 'EmailAddress', value: 'a@test.com' },
        { kind: 'EmailAddress', value: 'b@test.com' },
      ],
      invalidEmails: ['Syntactically invalid email: "+@test.com"', 'Syntactically invalid email: "b@test"'],
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('returns an Err value when the file is missing', async () => {
    let actualPathArg = '';
    const mockFileExistsFn = (filePath: string) => {
      actualPathArg = filePath;
      return false;
    };
    const result = await getEmails(mockDataDir, readFile, mockFileExistsFn);

    expect(actualPathArg).to.equal(`${dataDirPathString}/emails.json`);
    expect(result).to.deep.equal(makeErr(`File not found: ${dataDirPathString}/emails.json`));
  });

  it('returns an Err value when the file contains invalid JSON', async () => {
    const mockReadFileFn = (_filePath: string): string => 'not a JSON string';
    const result = await getEmails(mockDataDir, mockReadFileFn, mockFileExistsFn);

    expect(result).to.deep.equal(makeErr(`Can’t parse JSON in ${dataDirPathString}/emails.json`));
  });

  it('returns an Err value when the file doesn’t contain an array of strings', async () => {
    const getResult = async (json: string) => await getEmails(mockDataDir, () => json, mockFileExistsFn);
    const err = makeErr(`JSON in ${dataDirPathString}/emails.json is not an array of strings`);

    expect(await getResult('{"is-array": false}')).to.deep.equal(err);
    expect(await getResult('["email@test.com", 2, 3]')).to.deep.equal(err);
    expect(await getResult('"a string"')).to.deep.equal(err);
    expect(await getResult('null')).to.deep.equal(err);
  });

  describe(makeEmailAddress.name, () => {
    it('returns an EmailAddress value from the given string', () => {
      expect(makeEmailAddress('a@test.com')).to.deep.equal({
        kind: 'EmailAddress',
        value: 'a@test.com',
      } as EmailAddress);
      expect(makeEmailAddress('23@test.com')).to.deep.equal({
        kind: 'EmailAddress',
        value: '23@test.com',
      } as EmailAddress);
    });

    it('accepts “plus addressing”', () => {
      expect(makeEmailAddress('a+1@test.com')).to.deep.equal({
        kind: 'EmailAddress',
        value: 'a+1@test.com',
      } as EmailAddress);
    });

    it('trims the whitespace', () => {
      expect(makeEmailAddress('  a@test.com  ')).to.deep.equal({
        kind: 'EmailAddress',
        value: 'a@test.com',
      } as EmailAddress);
      expect(makeEmailAddress('	b@test.com\t\t')).to.deep.equal({
        kind: 'EmailAddress',
        value: 'b@test.com',
      } as EmailAddress);
      expect(makeEmailAddress('\r\nc@test.com ')).to.deep.equal({
        kind: 'EmailAddress',
        value: 'c@test.com',
      } as EmailAddress);
    });

    it('returns an Err value when the email is invalid', () => {
      expect(makeEmailAddress('')).to.deep.equal(makeErr('Syntactically invalid email: ""'));
      expect(makeEmailAddress(' \r\n\t')).to.deep.equal(makeErr('Syntactically invalid email: " \r\n\t"'));
      expect(makeEmailAddress('@test.com')).to.deep.equal(makeErr('Syntactically invalid email: "@test.com"'));
      expect(makeEmailAddress('a+@test.com')).to.deep.equal(makeErr('Syntactically invalid email: "a+@test.com"'));
      expect(makeEmailAddress('a++2@test.com')).to.deep.equal(makeErr('Syntactically invalid email: "a++2@test.com"'));
      expect(makeEmailAddress('++2@test.com')).to.deep.equal(makeErr('Syntactically invalid email: "++2@test.com"'));
      expect(makeEmailAddress('a@test')).to.deep.equal(makeErr('Syntactically invalid email: "a@test"'));
      expect(makeEmailAddress('a@too-short-tld.i')).to.deep.equal(
        makeErr('Syntactically invalid email: "a@too-short-tld.i"')
      );
      expect(makeEmailAddress('a@bad.')).to.deep.equal(makeErr('Syntactically invalid email: "a@bad."'));
    });
  });
});
