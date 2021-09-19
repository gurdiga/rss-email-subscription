import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { loadStoredEmails, makeFullEmailAddress } from './emails';
import { readStoredRssItems } from './rss-item-reading';
import { makeEmailMessage, makeUnsubscribeUrl, sendItem } from './item-sending';
import { logError, logInfo, logWarning } from '../shared/logging';
import { deleteItem } from './item-cleanup';
import { DataDir } from '../shared/data-dir';
import { requireEnv } from '../shared/env';
import { EmailDeliveryEnv } from './email-delivery';
import { FeedSettings } from '../shared/feed-settings';

export async function sendEmails(dataDir: DataDir, feedSettings: FeedSettings): Promise<number | undefined> {
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError(`Invalid environment variables`, { reason: env.reason });
    return 1;
  }

  logInfo(`Sending the new items from ${dataDir.value}`, { dataDir: dataDir.value });

  if (isErr(feedSettings)) {
    logError(`Invalid feed settings`, { dataDir: dataDir.value, reason: feedSettings.reason });
    return 1;
  }

  const { fromAddress } = feedSettings;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError(`Failed reading emails`, { dataDir: dataDir.value, reason: storedEmails.reason });
    return 1;
  }

  const { validEmails, invalidEmails } = storedEmails;

  if (isEmpty(validEmails)) {
    logError(`No valid emails found`, { dataDir: dataDir.value });
    return 1;
  }

  if (invalidEmails.length > 0) {
    logWarning(`Found invalid emails`, { dataDir: dataDir.value, invalidEmails });
  }

  logInfo(`Found emails`, { dataDir: dataDir.value, emailCount: validEmails.length });

  const storedRssItems = readStoredRssItems(dataDir);

  if (isErr(storedRssItems)) {
    logError(`Failed to read RSS items`, { dataDir: dataDir.value, reason: storedRssItems.reason });
    return 1;
  }

  const { validItems, invalidItems } = storedRssItems;

  if (!isEmpty(invalidItems)) {
    logWarning(`Found invalid RSS items`, { dataDir: dataDir.value, invalidItems });
  }

  if (isEmpty(validItems)) {
    logInfo(`No items to send`, { dataDir: dataDir.value });
    return 0;
  }

  logInfo(`Found ${validItems.length} items to send`, { dataDir: dataDir.value });

  for (const storedItem of validItems) {
    for (const hashedEmail of validEmails) {
      logInfo(`Sending RSS item`, { itemTitle: storedItem.item.title, toEmail: hashedEmail.emailAddress.value });

      const unsubscribeUrl = makeUnsubscribeUrl(dataDir, hashedEmail, feedSettings.displayName);
      const emailMessage = makeEmailMessage(storedItem.item, unsubscribeUrl);
      const from = makeFullEmailAddress(feedSettings.displayName, fromAddress);
      const sendingResult = await sendItem(from, hashedEmail.emailAddress, feedSettings.replyTo, emailMessage, env);

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
