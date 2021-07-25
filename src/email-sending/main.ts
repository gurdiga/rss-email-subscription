import { isEmpty } from '../shared/array-utils';
import { isErr, Result } from '../shared/lang';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { EmailList } from './emails';
import { readStoredRssItems } from './rss-item-reading';
import { sendItem } from './item-sending';
import { logError, logInfo, logWarning } from '../shared/logging';
import { deleteItem } from './item-cleanup';
import { makeDataDir } from '../shared/data-dir';

async function main(): Promise<number> {
  const dataDirString = getFirstCliArg(process);
  const dataDir = makeDataDir(dataDirString);

  if (isErr(dataDir)) {
    logError(`Invalid data dir`, { dataDirString, reason: dataDir.reason });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  logInfo(`Processing data dir ${dataDir.value}`, { dataDirString });

  // TODO: add loadStoredEmails()
  const emailReadingResult: Result<EmailList> = {
    kind: 'EmailList',
    validEmails: [],
    invalidEmails: [],
  };

  // if (isErr(emailReadingResult)) {
  //   logError(`reading emails: ${emailReadingResult.reason}`, { dataDirString });
  //   return 2;
  // }

  const { validEmails, invalidEmails } = emailReadingResult;

  // TODO: Add more structure: also log email count and any valuable data
  logInfo(`Found ${validEmails.length} emails`, { dataDirString });

  if (!isEmpty(invalidEmails)) {
    const count = invalidEmails.length;
    const formattedEmails = JSON.stringify(invalidEmails, null, 2);

    logWarning(`${count} invalid RSS items: ${formattedEmails}`, { dataDirString });
  }

  if (isEmpty(validEmails)) {
    logError(`No valid emails`, { dataDirString });
    return 3;
  }

  const rssItemReadingResult = readStoredRssItems(dataDir);

  if (isErr(rssItemReadingResult)) {
    logError(`Reading RSS items: ${rssItemReadingResult.reason}`, { dataDirString });
    return 2;
  }

  const { validItems, invalidItems } = rssItemReadingResult;

  logInfo(`Found ${validItems.length} RSS items to send.`, { dataDirString });

  if (!isEmpty(invalidItems)) {
    const count = invalidItems.length;
    const formattedItems = JSON.stringify(invalidItems, null, 2);

    logWarning(`${count} invalid RSS items read: ${formattedItems}`, { dataDirString });
  }

  for (const item of validItems) {
    for (const email of validEmails) {
      logInfo(`Sending "${item.item.title}" to ${email.value}`);

      const sendingResult = await sendItem(email, item.item);

      if (isErr(sendingResult)) {
        logError(sendingResult.reason);
      }

      const deletionResult = deleteItem(dataDir, item);

      if (isErr(deletionResult)) {
        logError(deletionResult.reason);
      }
    }
  }

  return 0;
}

main().then((exitCode) => process.exit(exitCode));
