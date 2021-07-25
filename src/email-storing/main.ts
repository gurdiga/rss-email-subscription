import path from 'path';
import { EmailAddress, readEmailListFromFile, storeEmails } from '../email-sending/emails';
import { hash } from '../shared/crypto';
import { makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { logError, logInfo } from '../shared/logging';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';

/*

This is a support script to create the data/emails.json during the
development process.

When storing a list of emails:

1. get the input string, one email per line - it can come from a file or
   from the HTTP request body;
2. parse the input string - get a list of EmailAddress values;
3. store the list of emails indexed by the seeded hash to
   data/email.json.

*/

async function main(): Promise<number> {
  const inputFilePath = path.join(process.cwd(), '.tmp/emails.csv');

  const dataDirString = getFirstCliArg(process);
  const dataDir = makeDataDir(dataDirString);

  if (isErr(dataDir)) {
    logError(`invalid args: ${dataDir.reason}`, { dataDirString });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  const feedSettingsReadingResult = getFeedSettings(dataDir);

  if (isErr(feedSettingsReadingResult)) {
    logError(`invalid feed settings: ${feedSettingsReadingResult.reason}`, { dataDirString });
    return 2;
  }

  const { hashingSeed } = feedSettingsReadingResult;
  const emailReadingResult = readEmailListFromFile(inputFilePath);

  if (isErr(emailReadingResult)) {
    logError(emailReadingResult.reason, { inputFilePath });
    return 3;
  }

  const { validEmails } = emailReadingResult;
  const hashEmail = (e: EmailAddress) => hash(e.value, hashingSeed);
  const storeResult = storeEmails(dataDir, validEmails, hashEmail);

  if (isErr(storeResult)) {
    logError(storeResult.reason, { dataDirString });
    return 4;
  }

  logInfo('Stored emails', { dataDirString, emailCount: validEmails.length });
  return 0;
}

main().then((exitCode) => process.exit(exitCode));
