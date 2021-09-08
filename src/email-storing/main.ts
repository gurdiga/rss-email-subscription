import path from 'path';
import { EmailAddress, indexEmails, readEmailListFromFile, storeEmailIndex } from '../email-sending/emails';
import { hash } from '../shared/crypto';
import { makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { logError, logInfo } from '../shared/logging';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';

async function main(): Promise<number | undefined> {
  const dataDirString = getFirstCliArg(process);
  const dataDir = makeDataDir(dataDirString);

  if (isErr(dataDir)) {
    logError(`Invalid args`, { dataDirString, reason: dataDir.reason });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  const inputFilePath = path.join(dataDir.value, 'emails.csv');
  const feedSettings = getFeedSettings(dataDir);

  if (isErr(feedSettings)) {
    logError(`Invalid feed settings`, { dataDirString, reason: feedSettings.reason });
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
    logError(storeResult.reason, { dataDirString });
    return 1;
  }

  logInfo('Stored emails', { dataDirString, validEmails: validEmails.length, invalidEmails });
}

main().then((exitCode) => process.exit(exitCode));
