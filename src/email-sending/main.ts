import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { loadStoredEmails } from './emails';
import { readStoredRssItems } from './rss-item-reading';
import { sendItem } from './item-sending';
import { logError, logInfo, logWarning } from '../shared/logging';
import { deleteItem } from './item-cleanup';
import { makeDataDir } from '../shared/data-dir';
import { makeUrl } from '../shared/url';
import { requireEnvVar } from '../shared/env';

const appBaseUrlString = requireEnvVar('APP_BASE_URL');

async function main(): Promise<number> {
  // const env = requireEnv({
  //   APP_BASE_URL: 'string',
  //   SMTP_CONNECTION_STRING: 'string',
  //   FROM_EMAIL_ADDRESS: 'string'
  // });

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

  const { validEmails, invalidEmails } = emailReadingResult;

  if (validEmails.length === 0) {
    logError(`No valid emails found`, { dataDirString });
  }

  if (invalidEmails.length > 0) {
    logWarning(`Found invalid emails`, { invalidEmails });
  }

  logInfo(`Found emails`, { dataDirString, emailCount: validEmails.length });

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

  const appBaseUrl = makeUrl(appBaseUrlString);

  if (isErr(appBaseUrl)) {
    logError(`Invalid app base URL`, { appBaseUrl: appBaseUrl.reason });
    return 3;
  }

  for (const storedItem of validItems) {
    for (const hashedEmail of validEmails) {
      logInfo(`Sending RSS item`, { itemTitle: storedItem.item.title, email: hashedEmail.emailAddress.value });

      const sendingResult = await sendItem(hashedEmail, storedItem.item, dataDir, appBaseUrl);

      if (isErr(sendingResult)) {
        logError(sendingResult.reason);
      }
    }

    const deletionResult = deleteItem(dataDir, storedItem);

    if (isErr(deletionResult)) {
      logError(deletionResult.reason);
    }
  }

  return 0;
}

main().then((exitCode) => process.exit(exitCode));
