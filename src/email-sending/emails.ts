import path from 'path';
import { filterUniqBy } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { readFile, ReadFileFn, writeFile, WriteFileFn } from '../shared/io';
import { Err, getErrorMessage, getTypeName, isErr, isNonEmptyString, makeErr, Result } from '../shared/lang';

export interface EmailList {
  kind: 'EmailList';
  validEmails: EmailAddress[];
  invalidEmails: string[];
}

export interface EmailAddress {
  kind: 'EmailAddress';
  value: string;
}

export interface FullEmailAddress {
  kind: 'FullEmailAddress';
  emailAddress: EmailAddress;
  displayName: string;
}

export function makeFullEmailAddress(displayName: string, emailAddress: EmailAddress): FullEmailAddress {
  return {
    kind: 'FullEmailAddress',
    displayName,
    emailAddress,
  };
}

export function makeEmailAddress(input: any): Result<EmailAddress> {
  const emailString = `${input}`;
  const email = emailString.trim();
  const err = makeErr(`Syntactically invalid email: "${emailString}"`);

  if (!email) {
    return err;
  }

  const keyCharacters = ['.', '@'];
  const containsKeyCharacters = keyCharacters.every((c) => email.includes(c));

  if (!containsKeyCharacters) {
    return err;
  }

  const parts = email.split('@');
  const [localPart, domain] = parts.map((s) => s.trim());
  const doesLocalPartLookReasonable = localPart.length > 0 && /^[a-z0-9-_]+((\+|\.)?[a-z0-9-_]+)*$/i.test(localPart);

  if (!doesLocalPartLookReasonable) {
    return err;
  }

  const domainLevels = domain.split(/\./).reverse();
  const doDomainPartsLookReasonable = /[a-z]{2,}/i.test(domainLevels[0]) && domainLevels.every((l) => l.length >= 1);

  if (!doDomainPartsLookReasonable) {
    return err;
  }

  return {
    kind: 'EmailAddress',
    value: email,
  };
}

export function isEmailAddress(value: any): value is EmailAddress {
  return value.kind === 'EmailAddress';
}

export function parseEmails(emailList: string): Result<EmailList> {
  const emailStrings = emailList.split('\n').filter(isNonEmptyString);
  const emails = emailStrings.map(makeEmailAddress);
  const validEmails = emails.filter(isEmailAddress).filter(filterUniqBy((e) => e.value));
  const invalidEmails = emails.filter(isErr).map((e) => e.reason);

  return {
    kind: 'EmailList',
    validEmails,
    invalidEmails,
  };
}

export type EmailHashFn = (emailAddress: EmailAddress) => EmailHash;
export type EmailHash = string;
export type EmailIndex = Record<EmailHash, EmailAddress['value']>;

export function indexEmails(emailAddresses: EmailAddress[], emailHashFn: EmailHashFn): EmailIndex {
  const index: EmailIndex = {};

  emailAddresses.forEach((e) => {
    index[emailHashFn(e)] = e.value;
  });

  return index;
}

export function readEmailListFromFile(filePath: string, readFileFn: ReadFileFn = readFile): Result<EmailList> {
  try {
    const fileContent = readFileFn(filePath);

    return parseEmails(fileContent);
  } catch (error) {
    return makeErr(`Could not read email list from file ${filePath}: ${getErrorMessage(error)}`);
  }
}

export const emailsFileName = 'emails.json';

export function storeEmailIndex(
  dataDir: DataDir,
  emailIndex: EmailIndex,
  writeFileFn: WriteFileFn = writeFile
): Result<void> {
  const filePath = path.join(dataDir.value, emailsFileName);
  const json = JSON.stringify(emailIndex);

  try {
    writeFileFn(filePath, json);
  } catch (error) {
    return makeErr(`Could not store email index to ${dataDir.value}/${emailsFileName}: ${getErrorMessage(error)}`);
  }
}

export interface StoredEmails {
  validEmails: HashedEmail[];
  invalidEmails: string[];
}

export interface HashedEmail {
  kind: 'HashedEmail';
  emailAddress: EmailAddress;
  saltedHash: EmailHash;
}

export function makeHashedEmail(emailAddress: EmailAddress, emailHashFn: EmailHashFn): HashedEmail {
  return {
    kind: 'HashedEmail',
    emailAddress,
    saltedHash: emailHashFn(emailAddress),
  };
}

function isHashedEmail(value: any): value is HashedEmail {
  return value.kind === 'HashedEmail';
}

export function loadStoredEmails(dataDir: DataDir, readFileFn: ReadFileFn = readFile): Result<StoredEmails> {
  const filePath = path.join(dataDir.value, emailsFileName);

  try {
    const json = readFileFn(filePath);

    try {
      const index = JSON.parse(json) as EmailIndex;

      if (getTypeName(index) !== 'object') {
        return makeErr('Email index JSON is expected to be an object with hashes as keys and emails as values');
      }

      const results = Object.entries(index).map(([key, value]) => parseIndexEntry(key, value));
      const validEmails = results.filter(isHashedEmail);
      const invalidEmails = results.filter(isErr).map((error) => error.reason);

      return {
        validEmails,
        invalidEmails,
      };
    } catch (error) {
      return makeErr(`Invalid JSON in ${filePath}`);
    }
  } catch (error) {
    return makeErr(`Can’t read file ${filePath}: ${getErrorMessage(error)}`);
  }
}

function parseIndexEntry(saltedHash: string, email: string): Result<HashedEmail> {
  if (typeof email !== 'string' || !isNonEmptyString(email)) {
    return makeErr(`Expected email string but got ${getTypeName(email)}: "${JSON.stringify(email)}"`);
  }

  if (!isNonEmptyString(saltedHash)) {
    return makeErr(`Empty hash for email "${email}"`);
  }

  const emailAddressMakingResult = makeEmailAddress(email);

  if (isErr(emailAddressMakingResult)) {
    return emailAddressMakingResult;
  }

  return {
    kind: 'HashedEmail',
    emailAddress: emailAddressMakingResult,
    saltedHash,
  };
}
