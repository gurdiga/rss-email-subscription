import { expect } from 'chai';
import { ReadFileFn } from '../../shared/io';
import { Err, isErr, makeErr } from '../../shared/lang';
import { AppStorage, makeStorage } from '../../shared/storage';
import { makeStub, makeThrowingStub } from '../../shared/test-utils';
import {
  EmailAddress,
  EmailList,
  parseEmails,
  makeEmailAddress,
  readEmailListFromCsvFile,
  EmailIndex,
  StoredEmails,
  loadStoredEmails,
  maxEmailLength,
  addEmail,
  EmailHashFn,
  HashedEmail,
} from './emails';

describe(parseEmails.name, () => {
  it('parses the emails from a one-per-line string', async () => {
    const emailList = [
      // prettier: keep these stacked
      'test1@test.com',
      'test2@test.com',
      'test3@test.com',
    ].join('\n');

    const result = await parseEmails(emailList);

    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [
        // prettier: keep these stacked
        email('test1@test.com'),
        email('test2@test.com'),
        email('test3@test.com'),
      ],
      invalidEmails: [],
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('eliminates duplicates and ignores empty lines', async () => {
    const emailList = [
      // prettier: keep these stacked
      'a@test.com',
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
        // prettier: keep these stacked
        email('a@test.com'),
        email('b@test.com'),
      ],
      invalidEmails: [],
    };

    expect(result).to.deep.equal(expectedResult as EmailList);
  });

  it('also returns invalid emails if any', async () => {
    const emailList = [
      // prettier: keep these stacked
      'a@test.com',
      '+@test.com',
      'b@test',
      'b@test.com',
    ].join('\n');

    const result = await parseEmails(emailList);
    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [
        // prettier: keep these stacked
        email('a@test.com'),
        email('b@test.com'),
      ],
      invalidEmails: ['Syntactically invalid email: "+@test.com"', 'Syntactically invalid email: "b@test"'],
    };

    expect(result).to.deep.equal(expectedResult);
  });
});

describe(addEmail.name, () => {
  const emailAddress = makeEmailAddress('a@test.com') as EmailAddress;
  const emailHashFn: EmailHashFn = (e) => `#${e.value}#`;

  it('adds an email address to a StoredEmails', () => {
    const storedEmails: StoredEmails = {
      validEmails: [],
      invalidEmails: [],
    };

    const newEmails = addEmail(storedEmails, emailAddress, emailHashFn);
    const expectedHashedEmail: HashedEmail = {
      kind: 'HashedEmail',
      emailAddress: emailAddress,
      saltedHash: emailHashFn(emailAddress),
      isConfirmed: false,
    };

    expect(newEmails.validEmails).to.have.lengthOf(1);
    expect(newEmails.validEmails[0]).to.deep.equal(expectedHashedEmail);
    expect(newEmails.invalidEmails).to.be.empty;
  });

  it('marks the email as confirmed when skipping double-opt-in', () => {
    const storedEmails: StoredEmails = {
      validEmails: [],
      invalidEmails: [],
    };
    const skipDoubleOptIn = true;

    const newEmails = addEmail(storedEmails, emailAddress, emailHashFn, skipDoubleOptIn);
    const expectedHashedEmail: HashedEmail = {
      kind: 'HashedEmail',
      emailAddress: emailAddress,
      saltedHash: emailHashFn(emailAddress),
      isConfirmed: true,
    };

    expect(newEmails.validEmails).to.have.lengthOf(1);
    expect(newEmails.validEmails[0]).to.deep.equal(expectedHashedEmail);
    expect(newEmails.invalidEmails).to.be.empty;
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

  it(`returns an Err value when the email is longer than ${maxEmailLength}`, () => {
    const tooLongAnEmail = `${'a'.repeat(maxEmailLength)}@toolong.com`;

    expect(makeEmailAddress(tooLongAnEmail)).to.deep.equal(makeErr('Email too long'));
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
    const readFile = makeStub<ReadFileFn>(() =>
      [
        // prettier: keep these stacked
        'a@test.com',
        'b@test.com',
        'c@test.com',
      ].join('\n')
    );

    const expectedResult: EmailList = {
      kind: 'EmailList',
      validEmails: [
        // prettier: keep these stacked
        email('a@test.com'),
        email('b@test.com'),
        email('c@test.com'),
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
  const feedId = 'path';
  const storageKey = '/path/emails.json';
  const storage = makeStorage('/data');

  const index: EmailIndex = {
    hash1: 'email1@test.com',
    hash2: 'email2@test.com',
    hash3: 'email3@test.com',
  };

  it('returns a list of stored emails with their hashes', () => {
    const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => index) };
    const result = loadStoredEmails(feedId, storageStub);

    expect(storageStub.loadItem.calls).to.deep.equal([[storageKey]]);
    expect(result).to.deep.equal({
      validEmails: [
        { kind: 'HashedEmail', emailAddress: email('email1@test.com'), saltedHash: 'hash1', isConfirmed: true },
        { kind: 'HashedEmail', emailAddress: email('email2@test.com'), saltedHash: 'hash2', isConfirmed: true },
        { kind: 'HashedEmail', emailAddress: email('email3@test.com'), saltedHash: 'hash3', isConfirmed: true },
      ],
      invalidEmails: [],
    } as StoredEmails);
  });

  it('can parse extended email information', () => {
    const extendedIndex: EmailIndex = {
      hash1: { emailAddress: 'email1@test.com' },
      hash2: { emailAddress: 'email2@test.com' },
      hash3: { emailAddress: 'email3@test.com' },
      hash4: 'email4@test.com',
    };

    const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => extendedIndex) };
    const result = loadStoredEmails(feedId, storageStub);

    expect(storageStub.loadItem.calls).to.deep.equal([[storageKey]]);
    expect(result).to.deep.equal({
      validEmails: [
        { kind: 'HashedEmail', emailAddress: email('email1@test.com'), saltedHash: 'hash1', isConfirmed: false },
        { kind: 'HashedEmail', emailAddress: email('email2@test.com'), saltedHash: 'hash2', isConfirmed: false },
        { kind: 'HashedEmail', emailAddress: email('email3@test.com'), saltedHash: 'hash3', isConfirmed: false },
        { kind: 'HashedEmail', emailAddress: email('email4@test.com'), saltedHash: 'hash4', isConfirmed: true },
      ],
      invalidEmails: [],
    } as StoredEmails);
  });

  it('also returns index items with invalid emails', () => {
    const index = {
      hash1: 'email1@test.com',
      hash2: 'email2@test.com',
      hash3: 'not-an-email',
      ' ': 'bad-hash@test.com',
      hash4: { emailAddress: 42 },
      hash5: null,
      hash6: [1, 2, 3],
      hash7: {},
    };

    const storageStub = { ...storage, loadItem: () => index };
    const result = loadStoredEmails(feedId, storageStub);

    expect(result).to.deep.equal({
      validEmails: [
        { kind: 'HashedEmail', emailAddress: email('email1@test.com'), saltedHash: 'hash1', isConfirmed: true },
        { kind: 'HashedEmail', emailAddress: email('email2@test.com'), saltedHash: 'hash2', isConfirmed: true },
      ],
      invalidEmails: [
        'Syntactically invalid email: "not-an-email"', // prettier: keep these stacked please
        'Expected non-empty hash string but got string: "" ""',
        'Expected email string but got number: "42"',
        'Expected EmailInformation object but got null: "null"',
        'Expected EmailInformation object but got array: "[1,2,3]"',
        'Expected EmailInformation object but got object: "{}"',
      ],
    } as StoredEmails);
  });

  it('returns an Err value when the loaded value is not an hash', () => {
    const invalidJsonStrings = ['null', '[]', '"string"', '42', 'true'];

    for (const storedValue of invalidJsonStrings) {
      const storageStub = { ...storage, loadItem: () => storedValue };
      const result = loadStoredEmails(feedId, storageStub) as Err;

      expect(isErr(result)).to.be.true;
      expect(result.reason).to.match(
        /Invalid email list format: .+ at \/path\/emails.json/,
        `storedValue: ${storedValue}`
      );
    }
  });

  it('returns an Err value when can’t load storage value', () => {
    const storageStub = { ...storage, loadItem: () => makeErr('File access denied?!') };

    expect(loadStoredEmails(feedId, storageStub)).to.deep.equal(
      makeErr(`Could not read email list at /path/emails.json`)
    );
  });
});

function email(s: string) {
  return makeEmailAddress(s) as EmailAddress;
}
