import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { getFirstCliArg, isRunDirectly, programFilePath } from '../shared/process-utils';
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

export async function main(dataDirString: string): Promise<number | undefined> {
  const env = requireEnv<Env>(['APP_BASE_URL', 'SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError(`Invalid environment variables`, { reason: env.reason });
    return 1;
  }

  const dataDir = makeDataDir(dataDirString);

  if (isErr(dataDir)) {
    logError(`Invalid data dir`, { dataDirString, reason: dataDir.reason });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  logInfo(`Processing data dir ${dataDir.value}`, { dataDirString });

  const feedSettings = getFeedSettings(dataDir);

  if (isErr(feedSettings)) {
    logError(`Invalid feed settings`, { dataDirString, reason: feedSettings.reason });
    return 1;
  }

  const { fromAddress } = feedSettings;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError(`Failed reading emails`, { dataDirString, reason: storedEmails.reason });
    return 1;
  }

  const { validEmails, invalidEmails } = storedEmails;

  if (validEmails.length === 0) {
    logError(`No valid emails found`, { dataDirString });
  }

  if (invalidEmails.length > 0) {
    logWarning(`Found invalid emails`, { dataDirString, invalidEmails });
  }

  logInfo(`Found emails`, { dataDirString, emailCount: validEmails.length });

  const storedRssItems = readStoredRssItems(dataDir);

  if (isErr(storedRssItems)) {
    logError(`Failed to read RSS items`, { dataDirString, reason: storedRssItems.reason });
    return 1;
  }

  const { validItems, invalidItems } = storedRssItems;

  logInfo(`Found RSS items to send`, { dataDirString, validItemCount: validItems.length });

  if (!isEmpty(invalidItems)) {
    logWarning(`Found invalid RSS items`, { dataDirString, invalidItems });
  }

  const appBaseUrl = makeUrl(env.APP_BASE_URL);

  if (isErr(appBaseUrl)) {
    logError(`Invalid app base URL`, { appBaseUrl: appBaseUrl.reason });
    return 1;
  }

  for (const storedItem of validItems) {
    for (const hashedEmail of validEmails) {
      logInfo(`Sending RSS item`, { itemTitle: storedItem.item.title, toEmail: hashedEmail.emailAddress.value });

      const unsubscribeLink = makeUnsubscribeLink(dataDir, hashedEmail, appBaseUrl);
      const emailMessage = makeEmailMessage(storedItem.item, unsubscribeLink);
      const sendingResult = await sendItem(fromAddress, hashedEmail.emailAddress, emailMessage, env);

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

if (isRunDirectly(module)) {
  main(getFirstCliArg(process)).then((exitCode) => process.exit(exitCode));
}
