import { AccountId, isAccountNotFound } from '../../domain/account';
import { loadAccount } from '../../domain/account-storage';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { makeEmailAddress } from '../../domain/email-address-making';
import { Feed, SendingReport } from '../../domain/feed';
import { FeedId } from '../../domain/feed-id';
import { getFeedLastSendingReportStorageKey, isFeedNotFound } from '../../domain/feed-storage';
import { Plan, Plans } from '../../domain/plan';
import { RssItem } from '../../domain/rss-item';
import { StorageKey } from '../../domain/storage';
import { AppStorage } from '../../domain/storage';
import { isEmpty, isNotEmpty } from '../../shared/array-utils';
import { makeDate } from '../../shared/date-utils';
import { requireEnv } from '../../shared/env';
import { Err, Result, isErr, isString, makeErr, makeNumber, makeString, makeValues } from '../../shared/lang';
import { logDuration, makeCustomLoggers } from '../../shared/logging';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { getFeedOutboxStorageKey, getFeedPostfixedStorageKey, getRssItemId } from '../rss-checking/new-item-recording';
import { EmailDeliveryEnv } from './email-delivery';
import { loadEmailAddresses, makeFullEmailAddress } from './emails';
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

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return 1;
  }

  if (isAccountNotFound(account)) {
    logError('Account not found');
    return 1;
  }

  const plan = Plans[account.planId];
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
    logInfo('No new RSS items');
  }

  const fromAddress = makeEmailAddress(si`${feed.id.value}@${env.DOMAIN_NAME}`);

  if (isErr(fromAddress)) {
    logError('Failed to build fromAddress', { reason: fromAddress.reason });
    return;
  }

  const from = makeFullEmailAddress(feed.displayName, fromAddress);
  const emailAddresses = loadEmailAddresses(accountId, feed.id, storage);

  if (isErr(emailAddresses)) {
    logError('Could not read emails', { reason: emailAddresses.reason });
    return 1;
  }

  if (isFeedNotFound(emailAddresses)) {
    logError('Feed not found');
    return 1;
  }

  const { validEmails, invalidEmails } = emailAddresses;

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

  // - Make an item directory to store emails:
  //  + /feeds/FEED_ID/inbox/rss-item-ITEM_ID.json
  //  - /feeds/FEED_ID/outbox/rss-item-ITEM_ID/EMAIL_ID.json
  //  - /feeds/FEED_ID/postfixed/rss-item-ITEM_ID/EMAIL_ID.json
  //
  // How do I make this idempotent? — So that if it crashews midcourse, it can safely resume when back up.
  for (const storedItem of validItems) {
    for (const hashedEmail of confirmedEmails) {
      const storeResult = storeEmailMessage(
        storage,
        env,
        accountId,
        feed,
        storedItem.item,
        hashedEmail,
        fromAddress,
        plan
      );

      if (isErr(storeResult)) {
        logError(si`Failed to ${storeEmailMessage.name}:`, {
          reason: storeResult.reason,
          accountId: accountId.value,
          feedId: feed.id.value,
          storedItem: storedItem.item.guid,
          hashedEmail: hashedEmail.emailAddress.value,
        });
      }
    }

    const deletionResult = deleteItem(accountId, feed.id, storage, storedItem);

    if (isErr(deletionResult)) {
      logError(deletionResult.reason);
    }
  }

  const outboxItemIds = getOutboxItemIds(storage, accountId, feed.id);

  if (isErr(outboxItemIds)) {
    logError(si`Failed to ${getOutboxItemIds.name}`, { reason: outboxItemIds.reason });
    return 1;
  }

  for (const itemId of outboxItemIds) {
    const storedEmailMessages = loadStoredEmailMessages(storage, accountId, feed.id, itemId);

    if (isErr(storedEmailMessages)) {
      logError(si`Failed to ${loadStoredEmailMessages.name}`, { reason: storedEmailMessages.reason });
      return 1;
    }

    const { messages, errs } = storedEmailMessages;

    if (!isEmpty(errs)) {
      logError(si`Some failures during ${loadStoredEmailMessages.name}`, { errs });
      return 1;
    }

    if (isEmpty(messages)) {
      logWarning(si`No valid stored email messages during ${loadStoredEmailMessages.name}`);
    }

    logInfo(si`Found ${messages.length} messages to postfix`);

    for (const message of messages) {
      const { to } = message;
      const logData = { subject: message.emailContent.subject, to: to.value };
      const sendingResult = await logDuration('Postfixing item', logData, async () => {
        return await sendEmail(from, to, feed.replyTo, message.emailContent, env);
      });

      if (isErr(sendingResult)) {
        report.failed++;
        logError(si`Failed to ${sendEmail.name}:`, { reason: sendingResult.reason });
        continue;
      }

      report.sent++;

      const archiveResult = archiveEmailMessage(storage, accountId, feed.id, itemId, message.id);

      if (isErr(archiveResult)) {
        logError(si`Failed to ${archiveEmailMessage.name}`, { reason: archiveResult.reason });
        return 1;
      }
    }

    const unprocessedMessages = listStoredEmailMessages(storage, accountId, feed.id, itemId);

    if (isErr(unprocessedMessages)) {
      logWarning(si`Failed to ${listStoredEmailMessages.name}`, { reason: unprocessedMessages.reason });
      continue;
    }

    if (!isEmpty(unprocessedMessages)) {
      continue;
    }

    const purgeResult = purgeOutboxItem(storage, accountId, feed.id, itemId);

    if (isErr(purgeResult)) {
      logError(si`Failed to ${purgeOutboxItem.name}: ${itemId}`, { reason: purgeResult.reason });
      return 1;
    }
  }

  logInfo('Sending report', { report });

  const storeReportResult = storeSendingReport(storage, report, accountId, feed.id);

  if (isErr(storeReportResult)) {
    logError(si`Failed to ${storeSendingReport.name}`, { reason: storeReportResult.reason });
  }

  return 0;
}

function purgeOutboxItem(storage: AppStorage, accountId: AccountId, feedId: FeedId, itemId: string): Result<void> {
  const itemStorageKey = getOutboxItemStorageKey(accountId, feedId, itemId);

  return storage.removeTree(itemStorageKey);
}

function getOutboxItemIds(storage: AppStorage, accountId: AccountId, feedId: FeedId) {
  const outboxStorageKey = getFeedOutboxStorageKey(accountId, feedId);

  return storage.listSubdirectories(outboxStorageKey);
}

function storeSendingReport(storage: AppStorage, report: SendingReport, accountId: AccountId, feedId: FeedId) {
  const storageKey = getFeedLastSendingReportStorageKey(accountId, feedId);

  return storage.storeItem(storageKey, report);
}

function storeEmailMessage(
  storage: AppStorage,
  env: EmailDeliveryEnv,
  accountId: AccountId,
  feed: Feed,
  item: RssItem,
  to: HashedEmail,
  fromAddress: EmailAddress,
  plan: Plan
): Result<void> {
  const storageKey = getStoredEmailMessageStorageKey(accountId, feed.id, item, to);

  const unsubscribeUrl = makeUnsubscribeUrl(feed.id, to, feed.displayName, env.DOMAIN_NAME);
  const emailContent = makeEmailContent(item, unsubscribeUrl, fromAddress);

  const message: StoredEmailMessageData = {
    to: to.emailAddress.value,
    subject: emailContent.subject,
    htmlBody: emailContent.htmlBody,
    pricePerEmailCents: plan.pricePerEmailCents,
    logRecords: [
      {
        status: StoredEmailStatus.Prepared,
        timestamp: new Date(),
        logMessage: 'Good.',
      },
    ],
  };

  return storage.storeItem(storageKey, message);
}

interface StoredEmailMessageData {
  subject: string;
  htmlBody: string;
  to: string;
  pricePerEmailCents: number;
  logRecords: StoredEmailLogRecord[];
}

interface StoredEmailMessage {
  id: string;
  emailContent: EmailContent;
  pricePerEmailCents: number;
  to: EmailAddress;
  logRecords: StoredEmailLogRecord[];
}

interface StoredEmailLogRecord {
  status: StoredEmailStatus;
  timestamp: Date;
  logMessage: string;
}

export function makeStoredEmailLogRecord(value: unknown): Result<StoredEmailLogRecord> {
  return makeValues<StoredEmailLogRecord>(value, {
    status: makeStoredEmailStatus,
    timestamp: makeDate,
    logMessage: makeString,
  });
}

enum StoredEmailStatus {
  Prepared = 'prepared',
  Postfixed = 'postfixed',
  Send = 'sent',
  Bounced = 'bounced',
  Deferred = 'deferred',
}

function isStoredEmailStatus(value: unknown): value is StoredEmailStatus {
  return Object.values(StoredEmailStatus).includes(value as any);
}

export function makeStoredEmailStatus(value: unknown, field = 'status'): Result<StoredEmailStatus> {
  if (!isString(value)) {
    return makeErr('Not a string', field);
  }

  if (!isStoredEmailStatus(value)) {
    return makeErr('Invalid status', field);
  }

  return value;
}

function getStoredEmailMessageStorageKey(
  accountId: AccountId,
  feedId: FeedId,
  item: RssItem,
  hashedEmail: HashedEmail
): string {
  const itemId = getRssItemId(item);
  const emailId = hashedEmail.saltedHash;
  const outboxStorageKey = getFeedOutboxStorageKey(accountId, feedId);

  return makePath(outboxStorageKey, itemId, si`${emailId}.json`);
}

interface StoredEmailMessages {
  messages: StoredEmailMessage[];
  errs: Err[];
}

function loadStoredEmailMessages(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  itemId: string
): Result<StoredEmailMessages> {
  const messageKeys = listStoredEmailMessages(storage, accountId, feedId, itemId);

  if (isErr(messageKeys)) {
    return makeErr(si`Failed to list messages for item ${itemId}: ${messageKeys.reason}`);
  }

  const messages: StoredEmailMessage[] = [];
  const errs: Err[] = [];

  messageKeys.forEach((messageId) => {
    const messageStorageKey = getOutboxMessageStorageKey(accountId, feedId, itemId, messageId);
    const data = storage.loadItem(messageStorageKey);

    if (isErr(data)) {
      errs.push(makeErr(si`Failed to load message: ${data.reason}`));
      return;
    }

    const storedEmailMessage = makeStoredEmailMessage(data, messageId);

    if (isErr(storedEmailMessage)) {
      errs.push(makeErr(si`Failed to ${makeStoredEmailMessage.name}: ${storedEmailMessage.reason}`));
      return;
    }

    messages.push(storedEmailMessage);
  });

  return {
    messages,
    errs,
  };
}

function listStoredEmailMessages(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  itemId: string
): Result<string[]> {
  const itemStorageKey = getOutboxItemStorageKey(accountId, feedId, itemId);
  const messageKeys = storage.listItems(itemStorageKey);

  return messageKeys;
}

// TODO: Consider adding unit test
function makeStoredEmailMessage(data: unknown | StoredEmailMessageData, id: string): Result<StoredEmailMessage> {
  const emailContent = makeValues<EmailContent>(data, {
    subject: makeString,
    htmlBody: makeString,
  });

  if (isErr(emailContent)) {
    return emailContent;
  }

  const values = makeValues<Pick<StoredEmailMessage, 'pricePerEmailCents' | 'to'>>(data, {
    pricePerEmailCents: makeNumber,
    to: makeEmailAddress,
  });

  if (isErr(values)) {
    return values;
  }

  const { pricePerEmailCents, to } = values;

  const logRecordsKey = 'logRecords' as keyof StoredEmailMessage;
  const logRecordsValue = (data as any).logRecords;
  const parsedLogRecords = makeValues(logRecordsValue, makeStoredEmailLogRecord, logRecordsKey);

  if (isErr(parsedLogRecords)) {
    return makeErr(si`Failed to parse ${logRecordsKey}: ${parsedLogRecords.reason}`);
  }

  const logRecords = parsedLogRecords.filter((x) => !isErr(x)) as StoredEmailLogRecord[];
  const invalidLogRecords = parsedLogRecords.filter(isErr);

  if (!isEmpty(invalidLogRecords)) {
    return makeErr(si`Failed to parse some ${logRecordsKey}: ${JSON.stringify(logRecordsValue)}`);
  }

  return {
    id,
    emailContent,
    pricePerEmailCents,
    to,
    logRecords,
  };
}

function archiveEmailMessage(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  itemId: string,
  messageId: string
): Result<void> {
  const outboxMessageStorageKey = getOutboxMessageStorageKey(accountId, feedId, itemId, messageId);
  const postfixedMessageStorageKey = getPostfixedMessageStorageKey(accountId, feedId, itemId, messageId);

  const renameResult = storage.renameItem(outboxMessageStorageKey, postfixedMessageStorageKey);

  if (isErr(renameResult)) {
    return makeErr(si`Failed to renameItem: ${renameResult.reason}`);
  }

  // TODO: recordEmailMessageStatus(messageId, StoredEmailStatus.Postfixed);

  return renameResult;
}

function getOutboxItemStorageKey(accountId: AccountId, feedId: FeedId, itemId: string): StorageKey {
  const outboxStorageKey = getFeedOutboxStorageKey(accountId, feedId);

  return makePath(outboxStorageKey, itemId);
}

function getPostfixedItemStorageKey(accountId: AccountId, feedId: FeedId, itemId: string): StorageKey {
  const outboxStorageKey = getFeedPostfixedStorageKey(accountId, feedId);

  return makePath(outboxStorageKey, itemId);
}

function getPostfixedMessageStorageKey(
  accountId: AccountId,
  feedId: FeedId,
  itemId: string,
  messageId: string
): StorageKey {
  const outboxStorageKey = getPostfixedItemStorageKey(accountId, feedId, itemId);

  return makePath(outboxStorageKey, messageId);
}

function getOutboxMessageStorageKey(accountId: AccountId, feedId: FeedId, itemId: string, messageId: string) {
  const outboxItemStorageKey = getOutboxItemStorageKey(accountId, feedId, itemId);

  return makePath(outboxItemStorageKey, messageId);
}
