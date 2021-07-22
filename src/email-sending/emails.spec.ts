import { expect } from 'chai';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { readFile } from '../shared/io';
import { makeErr } from '../shared/lang';
import {
  EmailAddress,
  EmailHashFn,
  EmailList,
  getEmails,
  indexEmails,
  isEmailAddress,
  makeEmailAddress,
} from './emails';

describe(getEmails.name, () => {
  const dataDirPathString = '/some/path';
  const dataDir = makeDataDir(dataDirPathString) as DataDir;
  const fileExistsFn = (_filePath: string) => true;

  // TODO: Change getEmails to get its input as a CSV string.

  it('reads a list of emails from the given dataDir', async () => {
    let actualPathArg = '';
    const readFileFn = (filePath: string): string => {
      actualPathArg = filePath;
      return ['test1@test.com', 'test2@test.com', 'test3@test.com'].join('\n');
    };
    const result = await getEmails(dataDir, readFileFn, fileExistsFn);
    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [
        { kind: 'EmailAddress', value: 'test1@test.com' },
        { kind: 'EmailAddress', value: 'test2@test.com' },
        { kind: 'EmailAddress', value: 'test3@test.com' },
      ],
      invalidEmails: [],
    };

    expect(actualPathArg).to.equal(`${dataDirPathString}/emails.json`);
    expect(result).to.deep.equal(expectedResult);
  });

  it('eliminates duplicates and ignores empty lines', async () => {
    const fileContent = [
      'a@test.com', // prettier: keep these stacked
      'a@test.com',
      ' b@test.com',
      ' ',
      '   \t  ',
      '',
      '\t',
      'b@test.com',
      'b@test.com',
    ].join('\n');
    const result = await getEmails(dataDir, () => fileContent, fileExistsFn);
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
    const fileContent = ['a@test.com', '+@test.com', 'b@test', 'b@test.com'].join('\n');
    const result = await getEmails(dataDir, () => fileContent, fileExistsFn);
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
    const fileExistsFn = (filePath: string) => {
      actualPathArg = filePath;
      return false;
    };
    const result = await getEmails(dataDir, readFile, fileExistsFn);

    expect(actualPathArg).to.equal(`${dataDirPathString}/emails.json`);
    expect(result).to.deep.equal(makeErr(`File not found: ${dataDirPathString}/emails.json`));
  });

  it('returns an Err value when can’t read the file contents', async () => {
    const error = new Error('Maybe can’t access?!');
    const readFileFn = (_filePath: string): string => {
      throw error;
    };
    const result = await getEmails(dataDir, readFileFn, fileExistsFn);

    expect(result).to.deep.equal(makeErr(`Can’t read file ${dataDirPathString}/emails.json: ${error.message}`));
  });
});

describe(indexEmails.name, () => {
  it('indexes emails by their seeded hash', () => {
    const emailAddresses = ['a@test.com', 'b@test.com', 'c@test.com'].map(makeEmailAddress).filter(isEmailAddress);
    const hashFn: EmailHashFn = (e) => `#${e.value}#`;
    const result = indexEmails(emailAddresses, hashFn);

    expect(result).to.deep.equal({
      '#a@test.com#': 'a@test.com',
      '#b@test.com#': 'b@test.com',
      '#c@test.com#': 'c@test.com',
    });
  });
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
