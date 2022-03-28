import { isEmpty } from '../shared/array-utils';
import { isErr } from '../web-ui/shared/lang';
import { loadStoredEmails, makeFullEmailAddress } from './emails';
import { readStoredRssItems } from './rss-item-reading';
import { makeEmailContent, makeUnsubscribeUrl, sendEmail } from './item-sending';
import { makeCustomLoggers } from '../shared/logging';
import { deleteItem } from './item-cleanup';
import { DataDir } from '../shared/data-dir';
import { requireEnv } from '../shared/env';
import { EmailDeliveryEnv } from './email-delivery';
import { FeedSettings } from '../shared/feed-settings';
import { basename } from 'path';

export async function sendEmails(dataDir: DataDir, feedSettings: FeedSettings): Promise<number | undefined> {
  const feedId = basename(dataDir.value);
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'email-sending', feedId });

  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError(`Invalid environment variables`, { reason: env.reason });
    return 1;
  }

  const storedRssItems = readStoredRssItems(dataDir);

  if (isErr(storedRssItems)) {
    logError(`Failed to read RSS items`, { reason: storedRssItems.reason });
    return 1;
  }

  const { validItems, invalidItems } = storedRssItems;

  if (!isEmpty(invalidItems)) {
    logWarning(`Invalid RSS items`, { invalidItems });
  }

  if (isEmpty(validItems)) {
    logInfo(`Nothing to send`);
    return;
  }

  const { fromAddress } = feedSettings;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError(`Could not read emails`, { reason: storedEmails.reason });
    return 1;
  }

  const { validEmails, invalidEmails } = storedEmails;

  if (isEmpty(validEmails)) {
    logError(`No valid emails`);
    return 1;
  }

  if (invalidEmails.length > 0) {
    logWarning(`Invalid emails`, { invalidEmails });
  }

  const confirmedEmails = validEmails.filter((email) => email.isConfirmed);
  const report = {
    sentExpected: validItems.length * confirmedEmails.length,
    sent: 0,
    failed: 0,
  };

  logInfo(`Sending new items`, { itemCount: validItems.length, emailCount: confirmedEmails.length });

  for (const storedItem of validItems) {
    for (const hashedEmail of confirmedEmails) {
      logInfo(`Sending item`, {
        itemTitle: storedItem.item.title,
        toEmail: hashedEmail.emailAddress.value,
      });

      const unsubscribeUrl = makeUnsubscribeUrl(dataDir, hashedEmail, feedSettings.displayName);
      const emailContent = makeEmailContent(storedItem.item, unsubscribeUrl, fromAddress);
      const from = makeFullEmailAddress(feedSettings.displayName, fromAddress);
      const sendingResult = await sendEmail(from, hashedEmail.emailAddress, feedSettings.replyTo, emailContent, env);

      if (isErr(sendingResult)) {
        report.failed++;
        logError(sendingResult.reason);
      } else {
        report.sent++;
        logInfo('Delivery info', { itemTitle: storedItem.item.title, ...sendingResult });
      }
    }

    const deletionResult = deleteItem(dataDir, storedItem);

    if (isErr(deletionResult)) {
      logError(deletionResult.reason);
    }
  }

  logInfo('Sending report', { report });

  return 0;
}
