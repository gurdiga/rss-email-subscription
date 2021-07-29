import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { loadStoredEmails } from './emails';
import { readStoredRssItems } from './rss-item-reading';
import { makeEmailMessage, makeUnsubscribeLink, sendItem } from './item-sending';
import { logError, logInfo, logWarning } from '../shared/logging';
import { deleteItem } from './item-cleanup';
import { makeDataDir } from '../shared/data-dir';
import { makeUrl } from '../shared/url';
import { requireEnv } from '../shared/env';
import { EmailDeliveryEnv } from './email-delivery';
import { getFeedSettings } from '../shared/feed-settings';

export interface Env extends EmailDeliveryEnv {
  APP_BASE_URL: string;
}

async function main(): Promise<number | undefined> {
  const env = requireEnv<Env>(['APP_BASE_URL', 'SMTP_CONNECTION_STRING', 'FROM_EMAIL_ADDRESS']);

  if (isErr(env)) {
    logError(`Invalid environment variables`, { reason: env.reason });
    return 1;
  }

  const dataDirString = getFirstCliArg(process);
  const dataDir = makeDataDir(dataDirString);

  if (isErr(dataDir)) {
    logError(`Invalid data dir`, { dataDirString, reason: dataDir.reason });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  logInfo(`Processing data dir ${dataDir.value}`, { dataDirString });

  const feedSettingsReadingResult = getFeedSettings(dataDir);

  if (isErr(feedSettingsReadingResult)) {
    logError(`Invalid feed settings`, { dataDirString, reason: feedSettingsReadingResult.reason });
    return 1;
  }

  const emailReadingResult = loadStoredEmails(dataDir);

  if (isErr(emailReadingResult)) {
    logError(`Failed reading emails`, { dataDirString, reason: emailReadingResult.reason });
    return 1;
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
    return 1;
  }

  const { validItems, invalidItems } = rssItemReadingResult;

  logInfo(`Found RSS items to send`, { dataDirString, validItemCount: validItems.length });

  if (!isEmpty(invalidItems)) {
    const count = invalidItems.length;
    const formattedItems = JSON.stringify(invalidItems, null, 2);

    logWarning(`Found invalid RSS items`, { dataDirString, itemCount: count, formattedItems });
  }

  const appBaseUrl = makeUrl(env.APP_BASE_URL);

  if (isErr(appBaseUrl)) {
    logError(`Invalid app base URL`, { appBaseUrl: appBaseUrl.reason });
    return 1;
  }

  for (const storedItem of validItems) {
    for (const hashedEmail of validEmails) {
      logInfo(`Sending RSS item`, { itemTitle: storedItem.item.title, email: hashedEmail.emailAddress.value });

      const unsubscribeLink = makeUnsubscribeLink(dataDir, hashedEmail, appBaseUrl);
      const emailMessage = makeEmailMessage(storedItem.item, unsubscribeLink);
      const from = hashedEmail.emailAddress; // TODO: get it from feed settings
      const sendingResult = await sendItem(from, hashedEmail.emailAddress, emailMessage, env);

      if (isErr(sendingResult)) {
        logError(sendingResult.reason);
      }
    }

    const deletionResult = deleteItem(dataDir, storedItem);

    if (isErr(deletionResult)) {
      logError(deletionResult.reason);
    }
  }
}

main().then((exitCode) => process.exit(exitCode));
