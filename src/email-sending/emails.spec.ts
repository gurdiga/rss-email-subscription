import { expect } from 'chai';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { ReadFileFn, WriteFileFn } from '../shared/io';
import { makeErr } from '../shared/lang';
import { makeSpy, makeStub, makeThrowingStub } from '../shared/test-utils';
import {
  EmailAddress,
  EmailHashFn,
  EmailList,
  parseEmails,
  isEmailAddress,
  makeEmailAddress,
  readEmailListFromCsvFile,
  emailsFileName,
  EmailIndex,
  StoredEmails,
  loadStoredEmails,
} from './emails';

describe(parseEmails.name, () => {
  it('parses the emails from a one-per-line string', async () => {
    const emailList = ['test1@test.com', 'test2@test.com', 'test3@test.com'].join('\n');
    const result = await parseEmails(emailList);
    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [
        { kind: 'EmailAddress', value: 'test1@test.com' },
        { kind: 'EmailAddress', value: 'test2@test.com' },
        { kind: 'EmailAddress', value: 'test3@test.com' },
      ],
      invalidEmails: [],
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('eliminates duplicates and ignores empty lines', async () => {
    const emailList = [
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
    const result = await parseEmails(emailList);
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

  it('also returns invalid emails if any', async () => {
    const emailList = ['a@test.com', '+@test.com', 'b@test', 'b@test.com'].join('\n');
    const result = await parseEmails(emailList);
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
});

describe(makeEmailAddress.name, () => {
  it('returns an EmailAddress value from the given string', () => {
    expect(makeEmailAddress('a@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'a@test.com',
    } as EmailAddress);
    expect(makeEmailAddress('no-23@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'no-23@test.com',
    } as EmailAddress);
    expect(makeEmailAddress('John.Doe@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'john.doe@test.com',
    } as EmailAddress);
    expect(makeEmailAddress('john_doe@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'john_doe@test.com',
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
    expect(makeEmailAddress(42)).to.deep.equal(makeErr('Syntactically invalid email: "42"'));
    expect(makeEmailAddress(undefined)).to.deep.equal(makeErr('Syntactically invalid email: "undefined"'));
    expect(makeEmailAddress(null)).to.deep.equal(makeErr('Syntactically invalid email: "null"'));
    expect(makeEmailAddress({})).to.deep.equal(makeErr('Syntactically invalid email: "[object Object]"'));
    expect(makeEmailAddress([])).to.deep.equal(makeErr('Syntactically invalid email: ""'));
  });
});

describe(readEmailListFromCsvFile.name, () => {
  const filePath = '/some/file.txt';

  it('reads and parses the emails from the given one-per-line file', () => {
    const readFile = makeStub<ReadFileFn>(() => ['a@test.com', 'b@test.com', 'c@test.com'].join('\n'));

    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [
        { kind: 'EmailAddress', value: 'a@test.com' },
        { kind: 'EmailAddress', value: 'b@test.com' },
        { kind: 'EmailAddress', value: 'c@test.com' },
      ],
      invalidEmails: [],
    };
    const result = readEmailListFromCsvFile(filePath, readFile);

    expect(readFile.calls).to.deep.equal([[filePath]]);
    expect(result).to.deep.equal(expectedResult);
  });

  it('returns an Err value when can’t read the file', () => {
    const error = new Error('Read failed for some reason');
    const readFile = makeThrowingStub<ReadFileFn>(error);
    const result = readEmailListFromCsvFile(filePath, readFile);

    expect(result).to.deep.equal(makeErr(`Could not read email list from file ${filePath}: ${error.message}`));
  });
});

describe(loadStoredEmails.name, () => {
  const dataDirString = '/some/path';
  const dataDir = makeDataDir(dataDirString) as DataDir;

  const index: EmailIndex = {
    hash1: 'email1@test.com',
    hash2: 'email2@test.com',
    hash3: 'email3@test.com',
  };

  it('returns a list of stored emails with their hashes', () => {
    const readFile = makeStub(() => JSON.stringify(index));
    const result = loadStoredEmails(dataDir, readFile);

    expect(readFile.calls).to.deep.equal([[`${dataDirString}/${emailsFileName}`]]);
    expect(result).to.deep.equal({
      validEmails: [
        { kind: 'HashedEmail', emailAddress: email('email1@test.com'), saltedHash: 'hash1' },
        { kind: 'HashedEmail', emailAddress: email('email2@test.com'), saltedHash: 'hash2' },
        { kind: 'HashedEmail', emailAddress: email('email3@test.com'), saltedHash: 'hash3' },
      ],
      invalidEmails: [],
    } as StoredEmails);
  });

  it('also returns index items with invalid emails', () => {
    const index = {
      hash1: 'email1@test.com',
      hash2: 'email2@test.com',
      hash3: 'what?',
      ' ': 'bad-hash@test.com',
      hash5: null,
      hash6: [1, 2, 3],
    };

    const readFile = makeStub(() => JSON.stringify(index));
    const result = loadStoredEmails(dataDir, readFile);

    expect(result).to.deep.equal({
      validEmails: [
        { kind: 'HashedEmail', emailAddress: email('email1@test.com'), saltedHash: 'hash1' },
        { kind: 'HashedEmail', emailAddress: email('email2@test.com'), saltedHash: 'hash2' },
      ],
      invalidEmails: [
        'Syntactically invalid email: "what?"', // prettier: keep these stacked please
        'Empty hash for email "bad-hash@test.com"',
        'Expected email string but got null: "null"',
        'Expected email string but got array: "[1,2,3]"',
      ],
    } as StoredEmails);
  });

  it('returns an Err value when the JSON is not an object', () => {
    let fileContent = '';
    const readFile = makeStub<ReadFileFn>(() => fileContent);
    const invalidJsonStrings = ['null', '[]', '"string"', '42', 'true'];

    for (fileContent of invalidJsonStrings) {
      expect(loadStoredEmails(dataDir, readFile)).to.deep.equal(
        makeErr('Email index JSON is expected to be an object with hashes as keys and emails as values'),
        `fileContent: ${fileContent}`
      );
    }
  });

  it('returns an Err value when JSON is not valid', () => {
    const readFile = makeStub<ReadFileFn>(() => '}');

    expect(loadStoredEmails(dataDir, readFile)).to.deep.equal(makeErr('Invalid JSON in /some/path/emails.json'));
  });

  it('returns an Err value when can’t read file', () => {
    const error = new Error('No access');
    const readFile = makeThrowingStub<ReadFileFn>(error);

    expect(loadStoredEmails(dataDir, readFile)).to.deep.equal(
      makeErr(`Can’t read file /some/path/emails.json: ${error.message}`)
    );
  });

  function email(s: string) {
    return makeEmailAddress(s) as EmailAddress;
  }
});
