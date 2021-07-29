import path from 'path';
import { EmailAddress, readEmailListFromFile, storeEmails } from '../email-sending/emails';
import { hash } from '../shared/crypto';
import { makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { logError, logInfo } from '../shared/logging';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';

async function main(): Promise<number> {
  const inputFilePath = path.join(process.cwd(), '.tmp/emails.csv');

  const dataDirString = getFirstCliArg(process);
  const dataDir = makeDataDir(dataDirString);

  if (isErr(dataDir)) {
    logError(`Invalid args`, { dataDirString, reason: dataDir.reason });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  const feedSettingsReadingResult = getFeedSettings(dataDir);

  if (isErr(feedSettingsReadingResult)) {
    logError(`Invalid feed settings`, { dataDirString, reason: feedSettingsReadingResult.reason });
    return 2;
  }

  const { hashingSalt } = feedSettingsReadingResult;
  const emailReadingResult = readEmailListFromFile(inputFilePath);

  if (isErr(emailReadingResult)) {
    logError(emailReadingResult.reason, { inputFilePath });
    return 3;
  }

  const { validEmails } = emailReadingResult;
  const hashEmail = (e: EmailAddress) => hash(e.value, hashingSalt);
  const storeResult = storeEmails(dataDir, validEmails, hashEmail);

  if (isErr(storeResult)) {
    logError(storeResult.reason, { dataDirString });
    return 4;
  }

  logInfo('Stored emails', { dataDirString, emailCount: validEmails.length });
  return 0;
}

main().then((exitCode) => process.exit(exitCode));
