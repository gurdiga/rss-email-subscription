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
import { AppRequestHandler, makeAppError, makeInputError } from './shared';

export const subscribe: AppRequestHandler = function subscribe(reqId, reqBody, _reqParams, dataDirRoot) {
  const { feedId, email } = reqBody;

  const { logWarning, logError } = makeCustomLoggers({ reqId, module: subscribe.name });
  const emailAddress = makeEmailAddress(email);

  if (isErr(emailAddress)) {
    logWarning('Invalid email', { emailAddress });
    return makeInputError('Invalid email');
  }

  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    logWarning('Invalid dataDir');
    return makeInputError('Invalid feed');
  }

  const feedSettings = getFeedSettings(dataDir);

  if (feedSettings.kind === 'FeedNotFound') {
    logWarning('Feed not found');
    return makeInputError('Feed not found');
  }

  if (isErr(feedSettings)) {
    logError('Can’t read feed settings', { reason: feedSettings.reason });
    return makeAppError('Can’t read feed settings');
  }

  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { reason: storedEmails.reason });
    return makeAppError('Databse read error');
  }

  if (storedEmails.invalidEmails.length > 0) {
    logWarning('Found invalid emails stored', { invalidEmails: storedEmails.invalidEmails });
  }

  if (emailAlreadyExists(emailAddress, storedEmails)) {
    logWarning('Already registered', { email: emailAddress.value });
    return makeInputError('Email is already subscribed');
  }

  const emailHashFn = makeEmailHashFn(feedSettings.hashingSalt);
  const newEmails = addEmail(storedEmails, emailAddress, emailHashFn);
  const result = storeEmails(newEmails, dataDir);

  if (isErr(result)) {
    logError('Can’t store emails', { reason: result.reason });
    return makeAppError('Databse write error');
  }

  return {
    kind: 'Success',
    message: 'You are subscribed now. Welcome aboard! 🙂',
  };
};

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
  storedEmails: StoredEmails,
  emailAddress: EmailAddress,
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
