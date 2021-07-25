import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { loadStoredEmails } from './emails';
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

  const emailReadingResult = loadStoredEmails(dataDir);

  if (isErr(emailReadingResult)) {
    logError(`Failed reading emails`, { dataDirString, reason: emailReadingResult.reason });
    return 2;
  }

  const { validHashedEmails, invalidHashedEmails } = emailReadingResult;

  if (validHashedEmails.length === 0) {
    logError(`No valid emails found`, { dataDirString });
  }

  if (invalidHashedEmails.length > 0) {
    logWarning(`Found invalid emails`, { invalidHashedEmails });
  }

  logInfo(`Found emails`, { dataDirString, emailCount: validHashedEmails.length });

  const rssItemReadingResult = readStoredRssItems(dataDir);

  if (isErr(rssItemReadingResult)) {
    logError(`Failed to read RSS items`, { dataDirString, reason: rssItemReadingResult.reason });
    return 2;
  }

  const { validItems, invalidItems } = rssItemReadingResult;

  logInfo(`Found RSS items to send`, { dataDirString, validItemCount: validItems.length });

  if (!isEmpty(invalidItems)) {
    const count = invalidItems.length;
    const formattedItems = JSON.stringify(invalidItems, null, 2);

    logWarning(`Found invalid RSS items`, { dataDirString, itemCount: count, formattedItems });
  }

  for (const item of validItems) {
    for (const hashedEmail of validHashedEmails) {
      logInfo(`Sending RSS item`, { itemTitle: item.item.title, email: hashedEmail.emailAddress.value });

      const sendingResult = await sendItem(hashedEmail.emailAddress, item.item);

      if (isErr(sendingResult)) {
        logError(sendingResult.reason);
      }
    }

    const deletionResult = deleteItem(dataDir, item);

    if (isErr(deletionResult)) {
      logError(deletionResult.reason);
    }
  }

  return 0;
}

main().then((exitCode) => process.exit(exitCode));
