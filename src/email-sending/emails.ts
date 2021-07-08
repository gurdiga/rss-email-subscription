import path from 'path';
import { filterUniq, filterUniqBy } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { fileExists, FileExistsFn, readFile, ReadFileFn } from '../shared/io';
import { isErr, makeErr, Result } from '../shared/lang';

export interface EmailList {
  kind: 'EmailList';
  validEmails: Email[];
  invalidEmails: string[];
}

export interface Email {
  kind: 'Email';
  value: string;
}

export function makeEmail(emailString: string): Result<Email> {
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
    kind: 'Email',
    value: email,
  };
}

function isEmail(value: any): value is Email {
  return value.kind === 'Email';
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
    const emails = emailStrings.map(makeEmail);
    const validEmails = emails.filter(isEmail).filter(filterUniqBy((e) => e.value));
    const invalidEmails = emails.filter(isErr).map((e) => e.reason);

    return {
      kind: 'EmailList',
      validEmails: validEmails,
      invalidEmails,
    };
  } catch (error) {
    return makeErr(`Can’t parse JSON: ${filePath}`);
  }
}
