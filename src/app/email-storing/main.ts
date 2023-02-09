import path from 'node:path';
import { addEmail, makeEmailHashFn, readEmailListFromCsvFile, StoredEmails } from '../email-sending/emails';
import { storeEmails } from '../email-sending/emails';
import { makeFeedId } from '../../domain/feed-id';
import { findFeedAccountId, loadFeed, isFeedNotFound } from '../../storage/feed-storage';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { getFirstCliArg } from '../../shared/process-utils';
import { makeStorage } from '../../storage/storage';
import { requireEnv } from '../../shared/env';
import { AppEnv } from '../../api/init-app';
import { si } from '../../shared/string-utils';
import { isAccountNotFound } from '../../domain/account';

async function main(): Promise<number | undefined> {
  const { logError, logInfo } = makeCustomLoggers({ module: 'email-storing' });
  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    process.exit(1);
  }

  const dataDirRoot = env.DATA_DIR_ROOT;
  const firstArg = getFirstCliArg(process);

  if (!firstArg) {
    logError('First argument is required: feedId');
    process.exit(1);
  }

  const feedId = makeFeedId(firstArg);

  if (isErr(feedId)) {
    logError('Invalid feedId');
    process.exit(1);
  }

  const storage = makeStorage(dataDirRoot);
  const inputFilePath = path.join(dataDirRoot, feedId.value, 'emails.csv');
  const accountId = findFeedAccountId(feedId, storage);

  if (isErr(accountId)) {
    logError(si`Failed to find feed account`, { reason: accountId.reason });
    process.exit(1);
  }

  if (isAccountNotFound(accountId)) {
    logError('Feed account not found');
    process.exit(1);
  }

  const feed = loadFeed(accountId, feedId, storage);

  if (isErr(feed)) {
    logError('Invalid feed settings', { feedId: feedId.value, reason: feed.reason });
    return 1;
  }

  if (isFeedNotFound(feed)) {
    logError('Feed not found', { feedId: feedId.value });
    return 1;
  }

  const emailReadingResult = readEmailListFromCsvFile(inputFilePath);

  if (isErr(emailReadingResult)) {
    logError(emailReadingResult.reason, { inputFilePath });
    return 1;
  }

  const { validEmails, invalidEmails } = emailReadingResult;

  if (invalidEmails.length > 0) {
    logError('Found invalid emails', { invalidEmails });
    return 1;
  }

  let storedEmails: StoredEmails = {
    validEmails: [],
    invalidEmails: [],
  };
  const emailHashFn = makeEmailHashFn(feed.hashingSalt);

  for (const emailAddress of validEmails) {
    storedEmails = addEmail(storedEmails, emailAddress, emailHashFn);
  }

  const result = storeEmails(storedEmails.validEmails, accountId, feedId, storage);

  if (isErr(result)) {
    logError(si`Failed to ${storeEmails.name}`, { reason: result.reason });
    return 1;
  }

  logInfo('Stored emails', {
    feedId: feedId.value,
    validEmails: storedEmails.validEmails.length,
    invalidEmails: storedEmails.invalidEmails,
  });

  return 0;
}

main().then((exitCode) => process.exit(exitCode));
