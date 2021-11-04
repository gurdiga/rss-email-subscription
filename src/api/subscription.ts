import path from 'path';
import {
  makeEmailAddress,
  loadStoredEmails,
  makeEmailHashFn,
  StoredEmails,
  EmailAddress,
  EmailHashFn,
  makeHashedEmail,
  HashedEmail,
} from '../email-sending/emails';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { writeFile, WriteFileFn } from '../shared/io';
import { Result, isErr, makeErr, getErrorMessage } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { Success } from './shared';

interface AlreadyRegistered {
  kind: 'AlreadyRegistered';
}

// TODO: CSRF?

export function subscribe(
  emailString: string,
  feedId: string,
  dataDirRoot: string
): Result<Success | AlreadyRegistered> {
  const { logWarning } = makeCustomLoggers({ module: 'subscription' });
  const emailAddress = makeEmailAddress(emailString);

  if (isErr(emailAddress)) {
    return emailAddress;
  }

  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    return dataDir;
  }

  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    return storedEmails;
  }

  if (storedEmails.invalidEmails.length > 0) {
    logWarning('Found invalid emails stored', { invalidEmails: storedEmails.invalidEmails });
  }

  if (emailAlreadyExists(emailAddress, storedEmails)) {
    return { kind: 'AlreadyRegistered' };
  }

  const feedSettings = getFeedSettings(dataDir);

  if (isErr(feedSettings)) {
    return feedSettings;
  }

  const emailHashFn = makeEmailHashFn(feedSettings.hashingSalt);
  const newEmails = addEmail(emailAddress, storedEmails, emailHashFn);
  const result = storeEmails(newEmails, dataDir);

  if (isErr(result)) {
    return result;
  }

  return { kind: 'Success' };
}

export function storeEmails(
  storedEmails: StoredEmails,
  dataDir: DataDir,
  writeFileFn: WriteFileFn = writeFile
): Result<void> {
  const indexEntry = (e: HashedEmail) => [e.saltedHash, e.emailAddress.value];
  const index = Object.fromEntries(storedEmails.validEmails.map(indexEntry));

  const fileContents = JSON.stringify(index);
  const filePath = path.join(dataDir.value, 'emails.json');

  try {
    writeFileFn(filePath, fileContents);
  } catch (error) {
    return makeErr(`Could not store emails: ${getErrorMessage(error)}`);
  }
}

export function addEmail(
  emailAddress: EmailAddress,
  storedEmails: StoredEmails,
  emailHashFn: EmailHashFn
): StoredEmails {
  const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);

  storedEmails.validEmails.push(hashedEmail);

  return storedEmails;
}

function emailAlreadyExists(emailAddress: EmailAddress, storedEmails: StoredEmails): boolean {
  const { validEmails } = storedEmails;
  const alreadyExists = validEmails.some((x) => x.emailAddress.value === emailAddress.value);

  return alreadyExists;
}
