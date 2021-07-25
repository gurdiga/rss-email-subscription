import path from 'path';
import { filterUniqBy } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { readFile, ReadFileFn, writeFile, WriteFileFn } from '../shared/io';
import { isErr, isNonEmptyString, makeErr, Result } from '../shared/lang';

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
  const containsKeyCharacters = keyCharacters.every((c) => !!emailString && emailString.includes(c)); // TODO: Why check for `!!emailString`? Then, why not use `email` instead?

  if (!containsKeyCharacters) {
    return err;
  }

  // TODO: Rename to `parts`
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
type EmailIndex = Record<string, string>;

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
  const emailIndex = indexEmails(emailAddresses, emailHashFn);
  const filePath = path.join(dataDir.value, emailsFileName);
  const json = JSON.stringify(emailIndex);

  try {
    writeFileFn(filePath, json);
  } catch (error) {
    return makeErr(`Could not store emails to ${dataDir.value}/${emailsFileName}: ${error.message}`);
  }
}
