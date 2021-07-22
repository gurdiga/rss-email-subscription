import path from 'path';
import { filterUniqBy } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { fileExists, FileExistsFn, readFile, ReadFileFn } from '../shared/io';
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
  const containsKeyCharacters = keyCharacters.every((c) => !!emailString && emailString.includes(c));

  if (!containsKeyCharacters) {
    return err;
  }

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

export async function getEmails(
  dataDir: DataDir,
  readFileFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): Promise<Result<EmailList>> {
  const filePath = path.resolve(dataDir.value, 'emails.json');

  if (!fileExistsFn(filePath)) {
    return makeErr(`File not found: ${filePath}`);
  }

  try {
    const emailStrings = readFileFn(filePath).split('\n').filter(isNonEmptyString);
    const emails = emailStrings.map(makeEmailAddress);
    const validEmails = emails.filter(isEmailAddress).filter(filterUniqBy((e) => e.value));
    const invalidEmails = emails.filter(isErr).map((e) => e.reason);

    return {
      kind: 'EmailList',
      validEmails,
      invalidEmails,
    };
  } catch (error) {
    return makeErr(`Can’t read file ${filePath}: ${error.message}`);
  }
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
