import path from 'path';
import { addEmail, storeEmails } from '../api/subscription';
import { makeEmailHashFn, readEmailListFromCsvFile, StoredEmails } from '../email-sending/emails';
import { makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';

async function main(): Promise<number | undefined> {
  const { logError, logInfo } = makeCustomLoggers({ module: 'email-storing' });
  const dataDirRoot = process.env.DATA_DIR_ROOT;

  if (!dataDirRoot) {
    logError(`DATA_DIR_ROOT envar missing`);
    process.exit(1);
  }

  const feedId = getFirstCliArg(process);
  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    logError(`Invalid args`, { feedId, reason: dataDir.reason });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  const inputFilePath = path.join(dataDir.value, 'emails.csv');
  const feedSettings = getFeedSettings(dataDir);

  if (isErr(feedSettings)) {
    logError(`Invalid feed settings`, { dataDir: dataDir.value, reason: feedSettings.reason });
    return 1;
  }

  if (feedSettings.kind === 'FeedNotFound') {
    logError('Feed not found', { dataDir });
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

  const result = storeEmails(storedEmails, dataDir);

  if (isErr(result)) {
    logError('Can’t store emails', { reason: result.reason });
    return 1;
  }

  logInfo('Stored emails', {
    dataDirString: feedId,
    validEmails: storedEmails.validEmails.length,
    invalidEmails: storedEmails.invalidEmails,
  });
}

main().then((exitCode) => process.exit(exitCode));
