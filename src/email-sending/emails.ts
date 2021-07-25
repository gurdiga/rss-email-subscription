import path from 'path';
import { filterUniqBy } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { readFile, ReadFileFn, writeFile, WriteFileFn } from '../shared/io';
import { Err, getTypeName, isErr, isNonEmptyString, makeErr, Result } from '../shared/lang';

export interface EmailList {
  kind: 'EmailList';
  validEmails: EmailAddress[];
  invalidEmails: string[];
}

export interface EmailAddress {
  kind: 'EmailAddress';
  value: string;
}

export function makeEmailAddress(emailString: string): Result<EmailAddress> {
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
  const doesLocalPartLookReasonable = localPart.length > 0 && /^[a-z0-9-]+((\+)?[a-z0-9-]+)*$/i.test(localPart);

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

export type EmailHashFn = (emailAddress: EmailAddress) => string;
export type EmailIndex = Record<string, string>;

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
    return makeErr(`Could not read email list from file ${filePath}: ${error.message}`);
  }
}

export const emailsFileName = 'emails.json';

export function storeEmails(
  dataDir: DataDir,
  emailAddresses: EmailAddress[],
  emailHashFn: EmailHashFn,
  writeFileFn: WriteFileFn = writeFile
): Result<void> {
  const filePath = path.join(dataDir.value, emailsFileName);
  const emailIndex = indexEmails(emailAddresses, emailHashFn);
  const json = JSON.stringify(emailIndex);

  try {
    writeFileFn(filePath, json);
  } catch (error) {
    return makeErr(`Could not store emails to ${dataDir.value}/${emailsFileName}: ${error.message}`);
  }
}

export interface StoredEmails {
  validHashedEmails: HashedEmail[];
  invalidHashedEmails: string[];
}

export interface HashedEmail {
  kind: 'HashedEmail';
  emailAddress: EmailAddress;
  seededHash: string; // TODO: replace seed with salt everywhere
}

function isHashedEmail(value: any): value is HashedEmail {
  return value.kind === 'HashedEmail';
}

export function loadStoredEmails(dataDir: DataDir, readFileFn: ReadFileFn = readFile): Result<StoredEmails> {
  const filePath = path.join(dataDir.value, emailsFileName);
  const json = readFileFn(filePath);

  try {
    const index = JSON.parse(json) as EmailIndex;

    if (getTypeName(index) !== 'object') {
      return makeErr('Email index JSON is expected to be an object with hashes as keys and emails as values');
    }

    const results = Object.entries(index).map(([key, value]) => parseIndexEntry(key, value));
    const validHashedEmails = results.filter(isHashedEmail);
    const invalidHashedEmails = results.filter(isErr).map((error) => error.reason);

    return {
      validHashedEmails,
      invalidHashedEmails,
    };
  } catch (error) {
    return makeErr(`Invalid JSON in ${filePath}`);
  }
}

function parseIndexEntry(seededHash: string, email: string): HashedEmail | Err {
  if (typeof email !== 'string' || !isNonEmptyString(email)) {
    return makeErr(`Expected email string but got ${getTypeName(email)}: "${JSON.stringify(email)}"`);
  }

  if (!isNonEmptyString(seededHash)) {
    return makeErr(`Empty hash for email "${email}"`);
  }

  const emailAddressMakingResult = makeEmailAddress(email);

  if (isErr(emailAddressMakingResult)) {
    return emailAddressMakingResult;
  }

  return {
    kind: 'HashedEmail',
    emailAddress: emailAddressMakingResult,
    seededHash,
  };
}
