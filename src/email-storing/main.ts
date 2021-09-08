import path from 'path';
import { EmailAddress, indexEmails, readEmailListFromFile, storeEmailIndex } from '../email-sending/emails';
import { hash } from '../shared/crypto';
import { makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { logError, logInfo } from '../shared/logging';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';

async function main(): Promise<number | undefined> {
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

  const { hashingSalt } = feedSettings;
  const emailReadingResult = readEmailListFromFile(inputFilePath);

  if (isErr(emailReadingResult)) {
    logError(emailReadingResult.reason, { inputFilePath });
    return 1;
  }

  const { validEmails, invalidEmails } = emailReadingResult;
  const hashEmail = (e: EmailAddress) => hash(e.value, hashingSalt);
  const emailIndex = indexEmails(validEmails, hashEmail);
  const storeResult = storeEmailIndex(dataDir, emailIndex);

  if (isErr(storeResult)) {
    logError(storeResult.reason, { dataDirString: feedId });
    return 1;
  }

  logInfo('Stored emails', { dataDirString: feedId, validEmails: validEmails.length, invalidEmails });
}

main().then((exitCode) => process.exit(exitCode));
