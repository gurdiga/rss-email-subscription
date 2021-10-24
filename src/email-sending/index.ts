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
import { basename } from 'path';

export async function sendEmails(dataDir: DataDir, feedSettings: FeedSettings): Promise<number | undefined> {
  const feedId = basename(dataDir.value);
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError(`Invalid environment variables`, { feedId, reason: env.reason });
    return 1;
  }

  const storedRssItems = readStoredRssItems(dataDir);

  if (isErr(storedRssItems)) {
    logError(`Failed to read RSS items`, { feedId, reason: storedRssItems.reason });
    return 1;
  }

  const { validItems, invalidItems } = storedRssItems;

  if (!isEmpty(invalidItems)) {
    logWarning(`Invalid RSS items`, { feedId, invalidItems });
  }

  const { fromAddress } = feedSettings;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError(`Could not read emails`, { feedId, reason: storedEmails.reason });
    return 1;
  }

  const { validEmails, invalidEmails } = storedEmails;

  if (isEmpty(validEmails)) {
    logError(`No valid emails`, { feedId });
    return 1;
  }

  if (invalidEmails.length > 0) {
    logWarning(`Invalid emails`, { feedId, invalidEmails });
  }

  const report = {
    sentExpected: validItems.length * validEmails.length,
    sent: 0,
    failed: 0,
  };

  logInfo(`Sending new items`, { feedId, itemCount: validItems.length, emailCount: validEmails.length });

  for (const storedItem of validItems) {
    for (const hashedEmail of validEmails) {
      logInfo(`Sending item`, {
        feedId,
        itemTitle: storedItem.item.title,
        toEmail: hashedEmail.emailAddress.value,
      });

      const unsubscribeUrl = makeUnsubscribeUrl(dataDir, hashedEmail, feedSettings.displayName);
      const emailMessage = makeEmailMessage(storedItem.item, unsubscribeUrl, fromAddress);
      const from = makeFullEmailAddress(feedSettings.displayName, fromAddress);
      const sendingResult = await sendItem(from, hashedEmail.emailAddress, feedSettings.replyTo, emailMessage, env);

      if (isErr(sendingResult)) {
        report.failed++;
        logError(sendingResult.reason, { feedId });
      } else {
        report.sent++;
        logInfo('Delivery info', { feedId, ...sendingResult });
      }
    }

    const deletionResult = deleteItem(dataDir, storedItem);

    if (isErr(deletionResult)) {
      logError(deletionResult.reason, { feedId });
    }
  }

  logInfo('Sending report', { feedId, report });
}
