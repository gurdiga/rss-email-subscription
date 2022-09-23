import path from 'path';
import {
  addEmail,
  makeEmailHashFn,
  readEmailListFromCsvFile,
  StoredEmails,
  storeEmails,
} from '../email-sending/emails';
import { getFeedSettings } from '../../shared/feed-settings';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { getFirstCliArg } from '../../shared/process-utils';
import { makeStorage } from '../../shared/storage';

async function main(): Promise<number | undefined> {
  const { logError, logInfo } = makeCustomLoggers({ module: 'email-storing' });
  const dataDirRoot = process.env['DATA_DIR_ROOT'];

  if (!dataDirRoot) {
    logError(`DATA_DIR_ROOT envar missing`);
    process.exit(1);
  }

  const feedId = getFirstCliArg(process);

  if (!feedId) {
    logError(`First argument is required: feedId`);
    process.exit(1);
  }

  const storage = makeStorage(dataDirRoot);
  const inputFilePath = path.join(dataDirRoot, feedId, 'emails.csv');
  const feedSettings = getFeedSettings(feedId, storage);

  if (isErr(feedSettings)) {
    logError(`Invalid feed settings`, { feedId, reason: feedSettings.reason });
    return 1;
  }

  if (feedSettings.kind === 'FeedNotFound') {
    logError('Feed not found', { feedId });
    return 1;
  }

  const emailReadingResult = readEmailListFromCsvFile(inputFilePath);

  if (isErr(emailReadingResult)) {
    logError(emailReadingResult.reason, { inputFilePath });
    return 1;
  }

  const { validEmails, invalidEmails } = emailReadingResult;

  if (invalidEmails.length > 0) {
    logError(`Found invalid emails`, { invalidEmails });
    return 1;
  }

  let storedEmails: StoredEmails = {
    validEmails: [],
    invalidEmails: [],
  };
  const emailHashFn = makeEmailHashFn(feedSettings.hashingSalt);

  for (const emailAddress of validEmails) {
    storedEmails = addEmail(storedEmails, emailAddress, emailHashFn);
  }

  const result = storeEmails(storedEmails.validEmails, feedId, storage);

  if (isErr(result)) {
    logError('Can’t store emails', { reason: result.reason });
    return 1;
  }

  logInfo('Stored emails', {
    feedId,
    validEmails: storedEmails.validEmails.length,
    invalidEmails: storedEmails.invalidEmails,
  });

  return 0;
}

main().then((exitCode) => process.exit(exitCode));
