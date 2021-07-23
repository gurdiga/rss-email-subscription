import path from 'path';
import { parseArgs } from '../email-sending/args';
import { EmailAddress, indexEmails, parseEmails, readEmailListFromFile } from '../email-sending/emails';
import { hash } from '../shared/crypto';
import { getFeedSettings } from '../shared/feed-settings';
import { readFile } from '../shared/io';
import { isErr } from '../shared/lang';
import { logError } from '../shared/logging';
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
  const inputCsvFilePath = path.join(__dirname, '.tmp/emails.csv');

  const dataDirString = getFirstCliArg(process);
  const argParsingResult = parseArgs(dataDirString);

  if (isErr(argParsingResult)) {
    logError(`invalid args: ${argParsingResult.reason}`, { dataDirString });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  const [dataDir] = argParsingResult.values;
  const feedSettingsReadingResult = getFeedSettings(dataDir);

  if (isErr(feedSettingsReadingResult)) {
    logError(`invalid feed settings: ${feedSettingsReadingResult.reason}`, { dataDirString });
    return 2;
  }

  const { hashingSeed } = feedSettingsReadingResult;
  const emailAddresses = readEmailListFromFile(inputCsvFilePath);

  if (isErr(emailAddresses)) {
    return 3;
  }

  const hashEmail = (e: EmailAddress) => hash(e.value, hashingSeed);
  const emailIndex = indexEmails(emailAddresses.validEmails, hashEmail);

  // const storeResult = storeEmails(emailAddresses)

  return 0;
}

main().then((exitCode) => process.exit(exitCode));
