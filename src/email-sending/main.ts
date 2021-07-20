import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { parseArgs } from './args';
import { getEmails } from './emails';
import { readStoredRssItems } from './rss-item-reading';
import { sendItem } from './item-sending';
import { logError, logInfo, logWarning } from '../shared/logging';
import { deleteItem } from './item-cleanup';

async function main(): Promise<number> {
  const dataDirString = getFirstCliArg(process);
  const argParsingResult = parseArgs(dataDirString);

  if (isErr(argParsingResult)) {
    logError(`invalid args: ${argParsingResult.reason}`, { dataDirString });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  const [dataDir] = argParsingResult.values;

  logInfo(`processing data dir ${dataDir.value}`, { dataDirString });

  const emailReadingResult = await getEmails(dataDir);

  if (isErr(emailReadingResult)) {
    logError(`reading emails: ${emailReadingResult.reason}`, { dataDirString });
    return 2;
  }

  const { validEmails, invalidEmails } = emailReadingResult;

  logInfo(`Found ${validEmails.length} emails.`, { dataDirString });

  if (!isEmpty(invalidEmails)) {
    const count = invalidEmails.length;
    const formattedEmails = JSON.stringify(invalidEmails, null, 2);

    logWarning(`${count} invalid RSS items: ${formattedEmails}`, { dataDirString });
  }

  if (isEmpty(validEmails)) {
    logError(`no valid emails`, { dataDirString });
    return 3;
  }

  const rssItemReadingResult = readStoredRssItems(dataDir);

  if (isErr(rssItemReadingResult)) {
    logError(`reading RSS items: ${rssItemReadingResult.reason}`, { dataDirString });
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

      // TODO: make sendItem return a Result<void> instead of throwing?
      try {
        await sendItem(email, item.item);
      } catch (error) {
        logError(`failed sending email: ${error.message}`);
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
