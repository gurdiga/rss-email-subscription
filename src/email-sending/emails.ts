import path from 'path';
import { filterUniqBy } from '../shared/array-utils';
import { hash } from '../shared/crypto';
import { DataDir } from '../shared/data-dir';
import { readFile, ReadFileFn } from '../shared/io';
import {
  getErrorMessage,
  getTypeName,
  isErr,
  isNonEmptyString,
  makeErr,
  makeTypeMismatchErr,
  Result,
} from '../web-ui/shared/lang';
import { isObject } from '../shared/object-utils';

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
  const email = emailString.trim().toLocaleLowerCase();
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
  const [localPart = '', domain = ''] = parts.map((s) => s.trim());
  const doesLocalPartLookReasonable = localPart.length > 0 && /^[a-z0-9-_]+((\+|\.)?[a-z0-9-_]+)*$/i.test(localPart);

  if (!doesLocalPartLookReasonable) {
    return err;
  }

  const domainLevels = domain.split(/\./).reverse();
  const doDomainPartsLookReasonable = /[a-z]{2,}/i.test(domainLevels[0]!) && domainLevels.every((l) => l.length >= 1);

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
export type EmailIndex = Record<EmailHash, EmailAddress['value'] | EmailInformation>;

interface EmailInformation {
  emailAddress: EmailAddress['value'];
  isConfirmed?: boolean; // TODO: Make this non-optional after migrating all feeds to EmailInformation.
}

export function makeEmailInformation(emailAddress: EmailAddress, isConfirmed: boolean): EmailInformation {
  return {
    emailAddress: emailAddress.value,
    isConfirmed,
  };
}

function isEmailInformation(x: any): x is EmailInformation {
  return isObject(x) && 'emailAddress' in x;
}

export function readEmailListFromCsvFile(filePath: string, readFileFn: ReadFileFn = readFile): Result<EmailList> {
  try {
    const fileContent = readFileFn(filePath);

    return parseEmails(fileContent);
  } catch (error) {
    return makeErr(`Could not read email list from file ${filePath}: ${getErrorMessage(error)}`);
  }
}

export const emailsFileName = 'emails.json';

export interface StoredEmails {
  validEmails: HashedEmail[];
  invalidEmails: string[];
}

export interface HashedEmail {
  kind: 'HashedEmail';
  emailAddress: EmailAddress;
  saltedHash: EmailHash;
  isConfirmed: boolean;
}

export function makeHashedEmail(emailAddress: EmailAddress, emailHashFn: EmailHashFn): HashedEmail {
  return {
    kind: 'HashedEmail',
    emailAddress,
    saltedHash: emailHashFn(emailAddress),
    isConfirmed: false,
  };
}

export function makeEmailHashFn(hashingSalt: string): EmailHashFn {
  return (e: EmailAddress) => hash(e.value, hashingSalt);
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
        return makeErr(
          'Email index JSON is expected to be an object with hashes as keys and emails or email info as values'
        );
      }

      const results = Object.entries(index).map(([key, value]) => {
        if (typeof value === 'string') {
          return parseSimpleIndexEntry(key, value);
        } else {
          return parseExtendedIndexEntry(key, value);
        }
      });

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

function parseSimpleIndexEntry(saltedHash: unknown, email: unknown): Result<HashedEmail> {
  if (typeof email !== 'string' || !isNonEmptyString(email)) {
    return makeTypeMismatchErr(email, `email string`);
  }

  if (typeof saltedHash !== 'string' || !isNonEmptyString(saltedHash)) {
    return makeTypeMismatchErr(saltedHash, `non-empty hash string`);
  }

  const emailAddressMakingResult = makeEmailAddress(email);

  if (isErr(emailAddressMakingResult)) {
    return emailAddressMakingResult;
  }

  return {
    kind: 'HashedEmail',
    emailAddress: emailAddressMakingResult,
    saltedHash,
    isConfirmed: true,
  };
}

function parseExtendedIndexEntry(saltedHash: unknown, emailInformation: unknown): Result<HashedEmail> {
  if (isEmailInformation(emailInformation)) {
    const result = parseSimpleIndexEntry(saltedHash, emailInformation.emailAddress);

    if (isErr(result)) {
      return result;
    } else {
      return {
        ...result,
        isConfirmed: !!emailInformation.isConfirmed,
      };
    }

    return result;
  } else {
    return makeTypeMismatchErr(emailInformation, `EmailInformation object`);
  }
}
