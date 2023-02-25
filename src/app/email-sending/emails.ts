import { FeedHashingSalt } from '../../domain/feed';
import { FeedId } from '../../domain/feed-id';
import { getFeedStorageKey } from '../../domain/feed-storage';
import { filterUniqBy } from '../../shared/array-utils';
import { hash } from '../../shared/crypto';
import { readFile, ReadFileFn } from '../../domain/io-isolation';
import { getErrorMessage, getTypeName, hasKind, isErr, isNonEmptyString, isObject } from '../../shared/lang';
import { makeErr, makeTypeMismatchErr, Result } from '../../shared/lang';
import { AppStorage } from '../../domain/storage';
import { si } from '../../shared/string-utils';
import { makePath } from '../../shared/path-utils';
import { AccountId } from '../../domain/account';
import { EmailAddress, EmailHash, HashedEmail } from '../../domain/email-address';
import { makeEmailAddress, isEmailAddress } from '../../domain/email-address-making';

export interface EmailList {
  kind: 'EmailList';
  validEmails: EmailAddress[];
  invalidEmails: string[];
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
export type EmailIndex = Record<EmailHash, EmailAddress['value'] | EmailInformation>;

interface EmailInformation {
  emailAddress: EmailAddress['value'];
  isConfirmed: boolean;
}

export function makeEmailInformation(emailAddress: EmailAddress, isConfirmed: boolean): EmailInformation {
  return {
    emailAddress: emailAddress.value,
    isConfirmed,
  };
}

function isEmailInformation(x: unknown): x is EmailInformation {
  return isObject(x) && 'emailAddress' in x;
}

export function readEmailListFromCsvFile(filePath: string, readFileFn: ReadFileFn = readFile): Result<EmailList> {
  try {
    const fileContent = readFileFn(filePath);

    return parseEmails(fileContent);
  } catch (error) {
    return makeErr(si`Could not read email list from file ${filePath}: ${getErrorMessage(error)}`);
  }
}

export interface StoredEmails {
  validEmails: HashedEmail[];
  invalidEmails: string[];
}

export function makeHashedEmail(
  emailAddress: EmailAddress,
  emailHashFn: EmailHashFn,
  isConfirmed = false
): HashedEmail {
  return {
    kind: 'HashedEmail',
    emailAddress,
    saltedHash: emailHashFn(emailAddress),
    isConfirmed,
  };
}

export function makeEmailHashFn(hashingSalt: FeedHashingSalt): EmailHashFn {
  return (e: EmailAddress) => hash(e.value, hashingSalt.value);
}

function isHashedEmail(value: unknown): value is HashedEmail {
  return hasKind(value, 'HashedEmail');
}

export function getEmailsStorageKey(accountId: AccountId, feedId: FeedId): string {
  return makePath(getFeedStorageKey(accountId, feedId), 'emails.json');
}

export function loadStoredEmails(accountId: AccountId, feedId: FeedId, storage: AppStorage): Result<StoredEmails> {
  const result: StoredEmails = {
    validEmails: [],
    invalidEmails: [],
  };

  const storageKey = getEmailsStorageKey(accountId, feedId);
  const hasItemResult = storage.hasItem(storageKey);

  if (isErr(hasItemResult)) {
    return makeErr(si`Could not check feed exists at ${storageKey}: ${hasItemResult.reason}`);
  }

  if (!hasItemResult) {
    return result;
  }

  const index = storage.loadItem(storageKey);

  if (isErr(index)) {
    return makeErr(si`Could not read email list at ${storageKey}: ${index.reason}`);
  }

  const indexTypeName = getTypeName(index);

  if (indexTypeName !== 'object') {
    return makeErr(si`Invalid email list format: ${indexTypeName} at ${storageKey} for feedId ${feedId.value}`);
  }

  const results = Object.entries(index).map(([key, value]) =>
    typeof value === 'string' ? parseSimpleIndexEntry(key, value) : parseExtendedIndexEntry(key, value)
  );

  result.validEmails = results.filter(isHashedEmail);
  result.invalidEmails = results.filter(isErr).map((error) => error.reason);

  return result;
}

function parseSimpleIndexEntry(saltedHash: unknown, email: unknown): Result<HashedEmail> {
  if (typeof email !== 'string' || !isNonEmptyString(email)) {
    return makeTypeMismatchErr(email, 'email string');
  }

  if (typeof saltedHash !== 'string' || !isNonEmptyString(saltedHash)) {
    return makeTypeMismatchErr(saltedHash, 'non-empty hash string');
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
    }

    return {
      ...result,
      isConfirmed: !!emailInformation.isConfirmed,
    };
  } else {
    return makeTypeMismatchErr(emailInformation, 'EmailInformation object');
  }
}

export function storeEmails(
  hashedEmails: HashedEmail[],
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage
): Result<void> {
  const emailIndex: EmailIndex = {};

  hashedEmails.forEach((e) => {
    emailIndex[e.saltedHash] = makeEmailInformation(e.emailAddress, e.isConfirmed);
  });

  const storageKey = getEmailsStorageKey(accountId, feedId);
  const storeItemResult = storage.storeItem(storageKey, emailIndex);

  if (isErr(storeItemResult)) {
    return makeErr(si`Could not store emails: ${storeItemResult.reason}`);
  }
}

export function addEmail(
  storedEmails: StoredEmails,
  emailAddress: EmailAddress,
  emailHashFn: EmailHashFn
): StoredEmails {
  const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);

  storedEmails.validEmails.push(hashedEmail);

  return storedEmails;
}
