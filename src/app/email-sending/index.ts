import { AccountId } from '../../domain/account';
import { HashedEmail } from '../../domain/email-address';
import { makeEmailAddress } from '../../domain/email-address-making';
import { Feed, SendingReport } from '../../domain/feed';
import { FeedId } from '../../domain/feed-id';
import { getFeedLastSendingReportStorageKey, getFeedRootStorageKey, isFeedNotFound } from '../../domain/feed-storage';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../domain/storage';
import { isEmpty, isNotEmpty } from '../../shared/array-utils';
import { requireEnv } from '../../shared/env';
import { Result, isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { getRssItemId } from '../rss-checking/new-item-recording';
import { EmailDeliveryEnv } from './email-delivery';
import { loadStoredEmails, makeFullEmailAddress } from './emails';
import { deleteItem } from './item-cleanup';
import { EmailContent, makeEmailContent, makeUnsubscribeUrl, sendEmail } from './item-sending';
import { readStoredRssItems } from './rss-item-reading';

export async function sendEmails(accountId: AccountId, feed: Feed, storage: AppStorage): Promise<number | undefined> {
  const deliveryId = new Date().toISOString().replace(/[:.]/g, '');
  const { logError, logInfo, logWarning } = makeCustomLoggers({
    module: 'email-sending',
    accountId: accountId.value,
    feedId: feed.id.value,
    deliveryId,
  });

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
  const report: SendingReport = {
    newItems: validItems.length,
    subscribers: confirmedEmails.length,
    sentExpected: validItems.length * confirmedEmails.length,
    sent: 0,
    failed: 0,
  };

  logInfo('Sending new items', {
    itemCount: validItems.length,
    emailCount: confirmedEmails.length,
  });

  for (const storedItem of validItems) {
    // - Make an item directory to store emails:
    //  + /feeds/FEED_ID/inbox/rss-item-ITEM_ID.json
    //  - /feeds/FEED_ID/outbox/rss-item-ITEM_ID/EMAIL_ID.json
    //  - /feeds/FEED_ID/postfixed/rss-item-ITEM_ID/EMAIL_ID.json
    //
    // How do I make this idempotent? — So that if it crashews midcourse, it can safely resume when back up.
    for (const hashedEmail of confirmedEmails) {
      logInfo('Sending item', {
        itemTitle: storedItem.item.title,
        toEmail: hashedEmail.emailAddress.value,
      });

      const unsubscribeUrl = makeUnsubscribeUrl(feed.id, hashedEmail, feed.displayName, env.DOMAIN_NAME);
      const emailContent = makeEmailContent(storedItem.item, unsubscribeUrl, fromAddress);
      const storeResult = storeEmail(storage, accountId, feed.id, storedItem.item, hashedEmail, emailContent);

      if (isErr(storeResult)) {
        logError(si`Failed to ${storeEmail.name}:`, {
          reason: storeResult.reason,
          accountId: accountId.value,
          feedId: feed.id.value,
          storedItem: storedItem.item.guid,
          hashedEmail: hashedEmail.emailAddress.value,
        });
      }

      const from = makeFullEmailAddress(feed.displayName, fromAddress);
      const sendingResult = await sendEmail(from, hashedEmail.emailAddress, feed.replyTo, emailContent, env);

      if (isErr(sendingResult)) {
        report.failed++;
        logError(si`Failed to ${sendEmail.name}:`, { reason: sendingResult.reason });
      } else {
        report.sent++;
        logInfo('Delivery info', {
          itemTitle: storedItem.item.title,
          to: hashedEmail.emailAddress.value,
          ...sendingResult,
        });
      }
    }

    const deletionResult = deleteItem(accountId, feed.id, storage, storedItem);

    if (isErr(deletionResult)) {
      logError(deletionResult.reason);
    }
  }

  logInfo('Sending report', { report });

  const storeReportResult = storeSendingReport(storage, report, accountId, feed.id);

  if (isErr(storeReportResult)) {
    logError(si`Failed to ${storeSendingReport.name}`, { reason: storeReportResult.reason });
  }

  return 0;
}

function storeSendingReport(storage: AppStorage, report: SendingReport, accountId: AccountId, feedId: FeedId) {
  const storageKey = getFeedLastSendingReportStorageKey(accountId, feedId);

  return storage.storeItem(storageKey, report);
}

function storeEmail(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  item: RssItem,
  to: HashedEmail,
  emailContent: EmailContent
): Result<void> {
  const storageKey = getStoredEmailStorageKey(accountId, feedId, item, to);

  const storedEmail: StoredEmail = {
    ...emailContent,
    to: to.emailAddress.value,
  };

  return storage.storeItem(storageKey, storedEmail);
}

interface StoredEmail extends EmailContent {
  to: string;
}

function getStoredEmailStorageKey(
  accountId: AccountId,
  feedId: FeedId,
  item: RssItem,
  hashedEmail: HashedEmail
): string {
  const itemId = getRssItemId(item);
  const emailId = hashedEmail.saltedHash;
  const feedRootStorageKey = getFeedRootStorageKey(accountId, feedId);

  // /accounts/ACCOUNT_ID/feeds/FEED_ID/outbox/ITEM_ID/EMAIL_ID.json
  return makePath(feedRootStorageKey, 'outbox', itemId, si`${emailId}.json`);
}
