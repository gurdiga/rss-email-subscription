import { isEmpty, isNotEmpty } from '../../shared/array-utils';
import { isErr } from '../../shared/lang';
import { loadStoredEmails, makeEmailAddress, makeFullEmailAddress } from './emails';
import { readStoredRssItems } from './rss-item-reading';
import { makeEmailContent, makeUnsubscribeUrl, sendEmail } from './item-sending';
import { makeCustomLoggers } from '../../shared/logging';
import { deleteItem } from './item-cleanup';
import { requireEnv } from '../../shared/env';
import { EmailDeliveryEnv } from './email-delivery';
import { Feed, isFeedNotFound } from '../../domain/feed-blob';
import { AppStorage } from '../../shared/storage';
import { AccountId } from '../../domain/account';
import { si } from '../../shared/string-utils';

export async function sendEmails(accountId: AccountId, feed: Feed, storage: AppStorage): Promise<number | undefined> {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'email-sending', feedId: feed.id.value });

  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError('Invalid environment variables', { reason: env.reason });
    return 1;
  }

  const storedRssItems = readStoredRssItems(accountId, feed.id, storage);

  if (isErr(storedRssItems)) {
    logError('Failed to read RSS items', { reason: storedRssItems.reason });
    return 1;
  }

  const { validItems, invalidItems } = storedRssItems;

  if (isNotEmpty(invalidItems)) {
    logWarning('Invalid RSS items', { invalidItems });
  }

  if (isEmpty(validItems)) {
    logInfo('Nothing to send');
    return;
  }

  const fromAddress = makeEmailAddress(si`${feed.id.value}@${env.DOMAIN_NAME}`);

  if (isErr(fromAddress)) {
    logError('Failed to build fromAddress', { reason: fromAddress.reason });
    return;
  }

  const storedEmails = loadStoredEmails(accountId, feed.id, storage);

  if (isErr(storedEmails)) {
    logError('Could not read emails', { reason: storedEmails.reason });
    return 1;
  }

  if (isFeedNotFound(storedEmails)) {
    logError('Feed not found');
    return 1;
  }

  const { validEmails, invalidEmails } = storedEmails;

  if (isEmpty(validEmails)) {
    logError('No valid emails');
    return 1;
  }

  if (invalidEmails.length > 0) {
    logWarning('Invalid emails', { invalidEmails });
  }

  const confirmedEmails = validEmails.filter((email) => email.isConfirmed);
  const report = {
    sentExpected: validItems.length * confirmedEmails.length,
    sent: 0,
    failed: 0,
  };

  logInfo('Sending new items', { itemCount: validItems.length, emailCount: confirmedEmails.length });

  for (const storedItem of validItems) {
    for (const hashedEmail of confirmedEmails) {
      logInfo('Sending item', {
        itemTitle: storedItem.item.title,
        toEmail: hashedEmail.emailAddress.value,
      });

      const unsubscribeUrl = makeUnsubscribeUrl(feed.id, hashedEmail, feed.displayName, env.DOMAIN_NAME);
      const emailContent = makeEmailContent(storedItem.item, unsubscribeUrl, fromAddress);
      const from = makeFullEmailAddress(feed.displayName, fromAddress);
      const sendingResult = await sendEmail(from, hashedEmail.emailAddress, feed.replyTo, emailContent, env);

      if (isErr(sendingResult)) {
        report.failed++;
        logError(sendingResult.reason);
      } else {
        report.sent++;
        logInfo('Delivery info', { itemTitle: storedItem.item.title, ...sendingResult });
      }
    }

    const deletionResult = deleteItem(accountId, feed.id, storage, storedItem);

    if (isErr(deletionResult)) {
      logError(deletionResult.reason);
    }
  }

  logInfo('Sending report', { report });

  return 0;
}
