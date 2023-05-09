import { AccountId } from '../../domain/account';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { makeEmailAddress } from '../../domain/email-address-making';
import { Feed, SendingReport } from '../../domain/feed';
import { FeedId } from '../../domain/feed-id';
import { Plan } from '../../domain/plan';
import { RssItem } from '../../domain/rss-item';
import { AppStorage, StorageKey } from '../../domain/storage';
import { isEmpty } from '../../shared/array-utils';
import { makeDate } from '../../shared/date-utils';
import {
  Err,
  Result,
  hasKind,
  isErr,
  isString,
  makeArrayOfValues,
  makeErr,
  makeNumber,
  makeOptionalString,
  makeString,
  makeValues,
} from '../../shared/lang';
import { logDuration, makeCustomLoggers } from '../../shared/logging';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { getFeedOutboxStorageKey, getRssItemId } from '../rss-checking/new-item-recording';
import { DeliveryInfo, EmailDeliveryEnv, sendEmail } from './email-delivery';
import { FullEmailAddress } from './emails';
import { EmailContent, makeEmailContent, makeUnsubscribeUrl } from './email-content';
import { ValidStoredRssItem, getStoredRssItemStorageKey } from './rss-item-reading';
import { getFeedRootStorageKey } from '../../domain/feed-storage';
import { md5 } from '../../shared/crypto';

export async function deliverItems(
  storage: AppStorage,
  env: EmailDeliveryEnv,
  accountId: AccountId,
  feed: Feed,
  plan: Plan,
  validItems: ValidStoredRssItem[],
  confirmedEmails: HashedEmail[],
  from: FullEmailAddress
) {
  prepareOutboxEmails(storage, env, accountId, feed, plan, validItems, confirmedEmails, from.emailAddress);
  return await sendOutboxEmails(storage, env, accountId, feed, validItems, confirmedEmails, from);
}

export async function sendOutboxEmails(
  storage: AppStorage,
  env: EmailDeliveryEnv,
  accountId: AccountId,
  feed: Feed,
  validItems: ValidStoredRssItem[],
  confirmedEmails: HashedEmail[],
  from: FullEmailAddress
): Promise<number> {
  const { logInfo, logWarning, logError } = makeCustomLoggers({
    module: sendOutboxEmails.name,
    accountId: accountId.value,
    feedId: feed.id.value,
  });

  const outboxItemIds = getOutboxItemIds(storage, accountId, feed.id);

  if (isErr(outboxItemIds)) {
    logError(si`Failed to ${getOutboxItemIds.name}`, { reason: outboxItemIds.reason });
    return 1;
  }

  const report: SendingReport = {
    newItems: validItems.length,
    subscribers: confirmedEmails.length,
    sentExpected: validItems.length * confirmedEmails.length,
    sent: 0,
    failed: 0,
  };

  logInfo('Sending new items', {
    itemCount: validItems.length,
    outboxItems: outboxItemIds.length,
    emailCount: confirmedEmails.length,
  });

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
      logWarning('No valid stored email messages in outbox');
    }

    logInfo(si`Found ${messages.length} messages to postfix`);

    for (const message of messages) {
      const { to } = message;
      const logData = { subject: message.emailContent.subject, to: to.value };
      const deliveryInfo = await logDuration('Postfixing item', logData, async () => {
        return await sendEmail(from, to, feed.replyTo, message.emailContent, env);
      });

      if (isErr(deliveryInfo)) {
        report.failed++;
        logError(si`Failed to ${sendEmail.name}:`, { reason: deliveryInfo.reason });
        continue;
      }

      report.sent++;

      const result = postfixEmailMessage(storage, accountId, feed.id, itemId, message.id, deliveryInfo);

      if (isErr(result)) {
        logError(si`Failed to ${postfixEmailMessage.name}`, { reason: result.reason });
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

  if (report.sent > 0 || report.failed > 0) {
    logInfo('Sending report', { report });
  }

  return 0;
}

export function prepareOutboxEmails(
  storage: AppStorage,
  env: EmailDeliveryEnv,
  accountId: AccountId,
  feed: Feed,
  plan: Plan,
  validItems: ValidStoredRssItem[],
  confirmedEmails: HashedEmail[],
  fromAddress: EmailAddress
): Result<number> {
  const { logError } = makeCustomLoggers({
    module: prepareOutboxEmails.name,
    accountId: accountId.value,
    feedId: feed.id.value,
  });

  for (const storedItem of validItems) {
    for (const hashedEmail of confirmedEmails) {
      const storeResult = storeOutboxEmail(
        feed,
        hashedEmail,
        storedItem.item,
        fromAddress,
        plan,
        env,
        accountId,
        storage
      );

      if (isErr(storeResult)) {
        logError(si`Failed to ${storeOutboxEmail.name}:`, {
          reason: storeResult.reason,
          accountId: accountId.value,
          feedId: feed.id.value,
          fileName: storedItem.fileName,
          to: hashedEmail.emailAddress.value,
        });
        return 1;
      }
    }

    const storeResult = storeOutboxedItem(storage, accountId, feed.id, storedItem);

    if (isErr(storeResult)) {
      logError(si`Failed to ${storeOutboxedItem.name}: ${storeResult.reason}`, {
        reason: storeResult.reason,
        accountId: accountId.value,
        feedId: feed.id.value,
        fileName: storedItem.fileName,
      });
      return 1;
    }
  }

  return 0;
}

function storeOutboxedItem(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  storedRssItem: ValidStoredRssItem
): Result<void> {
  const oldStorageKey = getStoredRssItemStorageKey(accountId, feedId, storedRssItem.fileName);
  const newStorageKey = getStoredItemStorageKey(accountId, feedId, storedRssItem);

  return storage.renameItem(oldStorageKey, newStorageKey);
}

function storeOutboxEmail(
  feed: Feed,
  hashedEmail: HashedEmail,
  item: RssItem,
  fromAddress: EmailAddress,
  plan: Plan,
  env: EmailDeliveryEnv,
  accountId: AccountId,
  storage: AppStorage
) {
  const messageData = makeStoredEmailMessageData(feed, hashedEmail, item, fromAddress, plan, env);
  const messageStorageKey = getOutboxMessageStorageKey(
    accountId,
    feed.id,
    getRssItemId(item),
    getMessageId(hashedEmail.emailAddress)
  );

  return storage.storeItem(messageStorageKey, messageData);
}

function getMessageId(emailAddress: EmailAddress): string {
  return md5(emailAddress.value);
}

function purgeOutboxItem(storage: AppStorage, accountId: AccountId, feedId: FeedId, itemId: string): Result<void> {
  const itemStorageKey = getOutboxItemStorageKey(accountId, feedId, itemId);

  return storage.removeTree(itemStorageKey);
}

function getOutboxItemIds(storage: AppStorage, accountId: AccountId, feedId: FeedId): Result<StorageKey[]> {
  const outboxStorageKey = getFeedOutboxStorageKey(accountId, feedId);

  const existsResult = storage.hasItem(outboxStorageKey);

  if (isErr(existsResult)) {
    return makeErr(si`Failed to check if exists: ${existsResult.reason}`);
  }

  if (existsResult === false) {
    return [];
  }

  return storage.listSubdirectories(outboxStorageKey);
}

interface StoredEmailMessageData {
  subject: string;
  htmlBody: string;
  to: string;
  pricePerEmailCents: number;
  logRecords: StoredEmailLogRecord[];
}

function makeStoredEmailMessageData(
  feed: Feed,
  to: HashedEmail,
  item: RssItem,
  fromAddress: EmailAddress,
  plan: Plan,
  env: EmailDeliveryEnv
): StoredEmailMessageData {
  const unsubscribeUrl = makeUnsubscribeUrl(feed.id, to, feed.displayName, env.DOMAIN_NAME);
  const emailContent = makeEmailContent(item, unsubscribeUrl, fromAddress);

  const message: StoredEmailMessageData = {
    to: to.emailAddress.value,
    subject: emailContent.subject,
    htmlBody: emailContent.htmlBody,
    pricePerEmailCents: plan.pricePerEmailCents,
    logRecords: [
      {
        status: PrePostfixMessageStatus.Prepared,
        timestamp: new Date(),
      },
    ],
  };

  return message;
}

function extractStoredEmailMessageData(message: StoredEmailMessage): StoredEmailMessageData {
  return {
    subject: message.emailContent.subject,
    htmlBody: message.emailContent.htmlBody,
    to: message.to.value,
    pricePerEmailCents: message.pricePerEmailCents,
    logRecords: message.logRecords,
  };
}

interface StoredEmailMessage {
  kind: 'StoredEmailMessage';
  id: string;
  emailContent: EmailContent;
  pricePerEmailCents: number;
  to: EmailAddress;
  logRecords: StoredEmailLogRecord[];
}

interface StoredEmailLogRecord {
  status: StoredEmailStatus;
  timestamp: Date;
  logMessage?: string;
}

export function makeStoredEmailLogRecord(value: unknown): Result<StoredEmailLogRecord> {
  return makeValues<StoredEmailLogRecord>(value, {
    status: makeStoredEmailStatus,
    timestamp: makeDate,
    logMessage: makeOptionalString,
  });
}

enum PrePostfixMessageStatus {
  Prepared = 'prepared',
  Postfixed = 'postfixed',
}

export enum PostfixDeliveryStatus {
  Sent = 'sent',
  Bounced = 'bounced',
  Deferred = 'deferred',
}

export function isPostfixDeliveryStatus(value: unknown): value is PostfixDeliveryStatus {
  return Object.values(PostfixDeliveryStatus).includes(value as any);
}

export type StoredEmailStatus = PrePostfixMessageStatus | PostfixDeliveryStatus;

function isStoredEmailStatus(value: unknown): value is StoredEmailStatus {
  const validValue = [PrePostfixMessageStatus, PostfixDeliveryStatus].flatMap((x) => Object.values(x));

  return validValue.includes(value);
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
  const messageIds = listStoredEmailMessages(storage, accountId, feedId, itemId);

  if (isErr(messageIds)) {
    return makeErr(si`Failed to list messages for item ${itemId}: ${messageIds.reason}`);
  }

  const results = messageIds
    .map(
      (messageId) => [messageId, getOutboxMessageStorageKey(accountId, feedId, itemId, messageId)] as [string, string]
    )
    .map(([messageId, storageKey]) => loadStoredEmailMessage(storage, storageKey, messageId));
  const messages = results.filter(isStoredEmailMessage);
  const errs = results.filter(isErr);

  return {
    messages,
    errs,
  };
}

export function loadStoredEmailMessage(
  storage: AppStorage,
  storageKey: StorageKey,
  messageId: string
): Result<StoredEmailMessage> {
  const data = storage.loadItem(storageKey);

  if (isErr(data)) {
    return makeErr(si`Failed to load message: ${data.reason}`);
  }

  const storedEmailMessage = makeStoredEmailMessage(data, messageId);

  if (isErr(storedEmailMessage)) {
    return makeErr(si`Failed to ${makeStoredEmailMessage.name}: ${storedEmailMessage.reason}`);
  }

  return storedEmailMessage;
}

function listStoredEmailMessages(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  itemId: string
): Result<string[]> {
  const itemStorageKey = getOutboxItemStorageKey(accountId, feedId, itemId);
  const messageKeys = storage.listItems(itemStorageKey);

  if (isErr(messageKeys)) {
    return makeErr(si`Failed to listItems: ${messageKeys.reason}`);
  }

  return messageKeys.map((x) => x.replace(/\.json$/, ''));
}

// TODO: Consider adding a happy-path unit test
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
  const parsedLogRecords = makeArrayOfValues(logRecordsValue, makeStoredEmailLogRecord, logRecordsKey);

  if (isErr(parsedLogRecords)) {
    return makeErr(si`Failed to parse ${logRecordsKey}: ${parsedLogRecords.reason}`);
  }

  const logRecords = parsedLogRecords.filter((x) => !isErr(x)) as StoredEmailLogRecord[];
  const invalidLogRecords = parsedLogRecords.filter(isErr);

  if (!isEmpty(invalidLogRecords)) {
    return makeErr(si`Failed to parse some ${logRecordsKey}: ${JSON.stringify(invalidLogRecords)}`);
  }

  return {
    kind: 'StoredEmailMessage',
    id,
    emailContent,
    pricePerEmailCents,
    to,
    logRecords,
  };
}

function isStoredEmailMessage(value: unknown): value is StoredEmailMessage {
  return hasKind(value, 'StoredEmailMessage');
}

function postfixEmailMessage(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  itemId: string,
  messageId: string,
  deliveryInfo: DeliveryInfo
): Result<void> {
  const outboxMessageStorageKey = getOutboxMessageStorageKey(accountId, feedId, itemId, messageId);
  const postfixedMessageStorageKey = getPostfixedMessageStorageKey(accountId, feedId, itemId, messageId);

  const renameResult = storage.renameItem(
    // prettier: keep these stacked
    outboxMessageStorageKey,
    postfixedMessageStorageKey,
    { overwriteIfExists: true }
  );

  if (isErr(renameResult)) {
    return makeErr(si`Failed to renameItem: ${renameResult.reason}`);
  }

  const appendStatusResult = appendStoredEmailMessageStatus(
    storage,
    postfixedMessageStorageKey,
    messageId,
    PrePostfixMessageStatus.Postfixed,
    deliveryInfo.response
  );

  if (isErr(appendStatusResult)) {
    return makeErr(si`Failed to ${appendStoredEmailMessageStatus.name}: ${appendStatusResult.reason}`);
  }

  const qId = getQidFromPostfixResponse(deliveryInfo.response);

  if (isErr(qId)) {
    return makeErr(si`Failed to ${getQidFromPostfixResponse.name}: ${qId.reason}`);
  }

  const recordQIdResult = recordQIdIndexEntry(
    storage,
    qId,
    accountId,
    feedId,
    itemId,
    messageId,
    PrePostfixMessageStatus.Postfixed
  );

  if (isErr(recordQIdResult)) {
    return makeErr(si`Failed to ${recordQIdIndexEntry.name}: ${recordQIdResult.reason}`);
  }
}

const qIdRe = /^250 2.0.0 Ok: queued as (.+)$/;

export function getQidFromPostfixResponse(deliveryInfoResponse: string): Result<string> {
  const qIdMatch = deliveryInfoResponse.match(qIdRe);
  const err = makeErr(si`Response does not match the expected format: "${deliveryInfoResponse}"`);

  if (qIdMatch === null) {
    return err;
  }

  const qId = qIdMatch[1];

  if (!qId) {
    return err;
  }

  return qId;
}

export const qidIndexRootStorageKey = '/qid-index';

export interface StoredMessageDetails {
  accountId: AccountId;
  feedId: FeedId;
  itemId: string;
  messageId: string;
  status: StoredEmailStatus;
}

export interface StoredMessageDetailsData {
  accountId: string;
  feedId: string;
  itemId: string;
  messageId: string;
  status: StoredEmailStatus;
}

export function recordQIdIndexEntry(
  storage: AppStorage,
  qId: string,
  accountId: AccountId,
  feedId: FeedId,
  itemId: string,
  messageId: string,
  status: StoredEmailStatus
): Result<void> {
  const storageKey = getQIdIndexEntryStorageKey(qId);
  const data: StoredMessageDetailsData = {
    accountId: accountId.value,
    feedId: feedId.value,
    itemId,
    messageId,
    status,
  };
  const result = storage.storeItem(storageKey, data);

  if (isErr(result)) {
    return makeErr(si`Failed to record queue ID: ${result.reason}`);
  }

  return result;
}

export function getQIdIndexEntryStorageKey(qId: string): StorageKey {
  return makePath(qidIndexRootStorageKey, qId);
}

export function appendStoredEmailMessageStatus(
  storage: AppStorage,
  storageKey: StorageKey,
  messageId: string,
  status: StoredEmailStatus,
  logMessage: string,
  timestamp = new Date()
): Result<void> {
  const message = loadStoredEmailMessage(storage, storageKey, messageId);

  if (isErr(message)) {
    return makeErr(si`Failed to ${loadStoredEmailMessage.name}: ${message.reason}`);
  }

  message.logRecords.push({
    status,
    timestamp,
    logMessage,
  });

  const messageData = extractStoredEmailMessageData(message);

  return storage.storeItem(storageKey, messageData);
}

function getOutboxItemStorageKey(accountId: AccountId, feedId: FeedId, itemId: string): StorageKey {
  const outboxStorageKey = getFeedOutboxStorageKey(accountId, feedId);

  return makePath(outboxStorageKey, itemId);
}

function getOutboxMessageStorageKey(accountId: AccountId, feedId: FeedId, itemId: string, messageId: string) {
  const outboxItemStorageKey = getOutboxItemStorageKey(accountId, feedId, itemId);

  return makePath(outboxItemStorageKey, si`${messageId}.json`);
}

export function getPostfixedMessageStorageKey(
  accountId: AccountId,
  feedId: FeedId,
  itemId: string,
  messageId: string
): StorageKey {
  return getStoredMessageStorageKey({
    accountId,
    feedId,
    itemId,
    messageId,
    status: PrePostfixMessageStatus.Postfixed,
  });
}

export function getItemsRootFolderStorageKey(accountId: AccountId, feedId: FeedId): StorageKey {
  const feedRootStorageKey = getFeedRootStorageKey(accountId, feedId);

  return makePath(feedRootStorageKey, 'items');
}

export function getItemFolderStorageKey(accountId: AccountId, feedId: FeedId, itemId: string): StorageKey {
  const itemsRootFolderStorageKey = getItemsRootFolderStorageKey(accountId, feedId);

  return makePath(itemsRootFolderStorageKey, itemId);
}

function getStoredItemStorageKey(accountId: AccountId, feedId: FeedId, storedRssItem: ValidStoredRssItem): StorageKey {
  const itemId = getRssItemId(storedRssItem.item);
  const itemFolderStorageKey = getItemFolderStorageKey(accountId, feedId, itemId);

  return makePath(itemFolderStorageKey, 'item.json');
}

export function getItemStatusFolderStorageKey(
  storedMessageDetails: StoredMessageDetails,
  status: StoredEmailStatus = storedMessageDetails.status
) {
  const { accountId, feedId, itemId } = storedMessageDetails;
  const itemFolderStorageKey = getItemFolderStorageKey(accountId, feedId, itemId);

  return makePath(itemFolderStorageKey, status);
}

export function getStoredMessageStorageKey(
  storedMessageDetails: StoredMessageDetails,
  status: StoredEmailStatus = storedMessageDetails.status
) {
  const { messageId } = storedMessageDetails;
  const itemStatusFolderStorageKey = getItemStatusFolderStorageKey(storedMessageDetails, status);

  return makePath(itemStatusFolderStorageKey, si`${messageId}.json`);
}
