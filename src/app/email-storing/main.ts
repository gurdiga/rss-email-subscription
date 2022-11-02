import path from 'path';
import {
  addEmail,
  makeEmailHashFn,
  readEmailListFromCsvFile,
  StoredEmails,
  storeEmails,
} from '../email-sending/emails';
import { getFeedSettings } from '../../domain/feed-settings';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { getFirstCliArg } from '../../shared/process-utils';
import { makeStorage } from '../../shared/storage';
import { requireEnv } from '../../shared/env';
import { AppEnv } from '../../api/init-app';

async function main(): Promise<number | undefined> {
  const { logError, logInfo } = makeCustomLoggers({ module: 'email-storing' });
  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError(`Invalid environment`, { reason: env.reason });
    process.exit(1);
  }

  const dataDirRoot = env.DATA_DIR_ROOT;
  const feedId = getFirstCliArg(process);

  if (!feedId) {
    logError(`First argument is required: feedId`);
    process.exit(1);
  }

  const storage = makeStorage(dataDirRoot);
  const inputFilePath = path.join(dataDirRoot, feedId, 'emails.csv');
  const feedSettings = getFeedSettings(feedId, storage, env.DOMAIN_NAME);

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
    logError(`Failed to ${storeEmails.name}`, { reason: result.reason });
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
