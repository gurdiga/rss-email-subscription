import path from 'path';
import { filterUniqBy } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { fileExists, FileExistsFn, readFile, ReadFileFn } from '../shared/io';
import { isErr, isString, makeErr, Result } from '../shared/lang';

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

function isEmail(value: any): value is EmailAddress {
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
    const emailStrings = JSON.parse(readFileFn(filePath)) as string[];

    if (Array.isArray(emailStrings) && emailStrings.every(isString)) {
      const emails = emailStrings.map(makeEmailAddress);
      const validEmails = emails.filter(isEmail).filter(filterUniqBy((e) => e.value));
      const invalidEmails = emails.filter(isErr).map((e) => e.reason);

      return {
        kind: 'EmailList',
        validEmails,
        invalidEmails,
      };
    } else {
      return makeErr(`JSON in ${filePath} is not an array of strings`);
    }
  } catch (error) {
    return makeErr(`Can’t parse JSON in ${filePath}`);
  }
}
