import {
  getDeliveriesRootStorageKey,
  getDeliveryItemStorageKey,
  getDeliveryStorageKey,
  getDeliveryTimestampStorageKey,
} from '../app/email-sending/item-delivery';
import { makeRssItem } from '../app/email-sending/rss-item-reading';
import { AccountId, isAccountNotFound } from '../domain/account';
import { loadAccount } from '../domain/account-storage';
import {
  DeliveryReport,
  DeliveryReportResponse,
  DeliveryReports,
  DeliveryReportsRequestData,
  MessageCounts,
  isDeliveryReport,
  makeDeliveryReportData,
  makeDeliveryReportsRequest,
} from '../domain/delivery-reports';
import { DeliveryStatus, PostfixDeliveryStatus, SyntheticDeliveryStatus } from '../domain/delivery-status';
import { FeedId } from '../domain/feed-id';
import { FeedNotFound, getFeedRootStorageKey, isFeedNotFound, makeFeedNotFound } from '../domain/feed-storage';
import { RssItem } from '../domain/rss-item';
import { AppStorage, StorageKey } from '../domain/storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { SortDirection, isEmpty, sortBy } from '../shared/array-utils';
import { makeDate } from '../shared/date-utils';
import { Result, isErr, makeErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { AppRequestHandler } from './app-request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const deliveryReports: AppRequestHandler = async function deliveryReports(
  reqId,
  _reqBody,
  reqParams,
  reqSession,
  { storage }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: deliveryReports.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const request = makeDeliveryReportsRequest(reqParams);
  const fieldName: keyof DeliveryReportsRequestData = 'feedId';

  if (isErr(request)) {
    logWarning(si`Failed to ${makeDeliveryReportsRequest.name}`, {
      reason: request.reason,
      feedUrl: reqParams[fieldName],
    });
    return makeInputError(request.reason, fieldName);
  }

  const { accountId } = session;
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}: ${account.reason}`);
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logError('Account not found for delivery reports');
    return makeAppError();
  }

  const results = makeDeliveryReports(storage, accountId, request.feedId);

  if (isErr(results)) {
    logError(si`Failed to ${makeDeliveryReports.name}: ${results.reason}`, {
      feedId: request.feedId.value,
      accountId: accountId.value,
    });
    return makeAppError();
  }

  if (isFeedNotFound(results)) {
    logWarning('Feed for delivery reports not found', {
      feedId: request.feedId.value,
      accountId: accountId.value,
    });
    return makeInputError('Feed not found');
  }

  const reports = results.filter(isDeliveryReport);
  const errs = results.filter(isErr);

  if (!isEmpty(errs)) {
    logWarning(si`Got some Errs from ${makeDeliveryReports.name}`, { errs: errs.map((x) => x.reason) });
  }

  const logData = {};
  const responseData: DeliveryReportResponse = {
    reports: reports.sort(sortBy(({ deliveryStart }) => deliveryStart, SortDirection.Desc)).map(makeDeliveryReportData),
  };

  return makeSuccess('OK', logData, responseData);
};

function makeDeliveryReports(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId
): Result<DeliveryReports | FeedNotFound> {
  const feedRootStorageKey = getFeedRootStorageKey(accountId, feedId);
  const feedRootExists = storage.hasItem(feedRootStorageKey);

  if (isErr(feedRootExists)) {
    return makeErr(si`Failed to check for feed: ${feedRootExists.reason}`);
  }

  if (feedRootExists === false) {
    return makeFeedNotFound(feedId);
  }

  const storageKey = getDeliveriesRootStorageKey(accountId, feedId);
  const itemsRootExists = storage.hasItem(storageKey);

  if (isErr(itemsRootExists)) {
    return makeErr(si`Failed to check for reports: ${itemsRootExists.reason}`);
  }

  if (itemsRootExists === false) {
    return [];
  }

  const deliveryIds = storage.listSubdirectories(storageKey);

  if (isErr(deliveryIds)) {
    return makeErr(si`Failed to list reports: ${deliveryIds.reason}`);
  }

  return deliveryIds.sort().map((deliveryId) => {
    const rssItem = loadDeliveryItem(storage, accountId, feedId, deliveryId);

    if (isErr(rssItem)) {
      return makeErr(si`Failed to ${makeRssItem.name}: ${rssItem.reason}`);
    }

    const messageCounts = loadMessageCounts(storage, accountId, feedId, deliveryId);

    if (isErr(messageCounts)) {
      return makeErr(si`Failed to ${loadMessageCounts.name}: ${messageCounts.reason}`);
    }

    const deliveryStart = loadDeliveryTimestamp(storage, accountId, feedId, deliveryId);

    if (isErr(deliveryStart)) {
      return makeErr(si`Failed to ${loadDeliveryTimestamp.name}: ${deliveryStart.reason}`);
    }

    const report: DeliveryReport = {
      kind: 'DeliveryReport',
      deliveryStart,
      postTitle: rssItem.title,
      postURL: rssItem.link,
      messageCounts,
    };

    return report;
  });
}

function loadDeliveryItem(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  deliveryId: string
): Result<RssItem> {
  const deliveryStorageKey = getDeliveryItemStorageKey(accountId, feedId, deliveryId);
  const itemData = storage.loadItem(deliveryStorageKey);

  if (isErr(itemData)) {
    return makeErr(si`Failed to load item data: ${itemData.reason}`);
  }

  return makeRssItem(itemData);
}

function loadDeliveryTimestamp(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  deliveryId: string
): Result<Date> {
  const storageKey = getDeliveryTimestampStorageKey(accountId, feedId, deliveryId);
  const dateString = storage.loadItem(storageKey);

  if (isErr(dateString)) {
    return makeErr(si`Failed to load item data: ${dateString.reason}`);
  }

  return makeDate(dateString);
}

function loadMessageCounts(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  deliveryId: string
): Result<MessageCounts> {
  const itemDeliveryReportsRoot = getDeliveryStorageKey(accountId, feedId, deliveryId);
  const deliveryStates: DeliveryStatus[] = [
    PostfixDeliveryStatus.Sent,
    PostfixDeliveryStatus.Deferred,
    PostfixDeliveryStatus.Bounced,
    SyntheticDeliveryStatus.MailboxFull,
  ];
  let counts: Partial<MessageCounts> = {};

  for (const status of deliveryStates) {
    const count = getMessageCount(storage, itemDeliveryReportsRoot, status);

    if (isErr(count)) {
      return makeErr(si`Failed to ${getMessageCount.name} fror ${status}: ${count.reason}`);
    }

    counts[status] = count;
  }

  return counts as MessageCounts;
}

function getMessageCount(
  storage: AppStorage,
  itemDataStorageKey: StorageKey,
  deliveryStatus: DeliveryStatus
): Result<number> {
  const statusDirStoragKey = makePath(itemDataStorageKey, deliveryStatus);
  const dirExists = storage.hasItem(statusDirStoragKey);

  if (isErr(dirExists)) {
    return makeErr(si`Failed to check if directory exists: ${dirExists.reason}`, deliveryStatus);
  }

  if (dirExists === false) {
    return 0;
  }

  const items = storage.listItems(statusDirStoragKey);

  if (isErr(items)) {
    return makeErr(si`Failed to list items: ${items.reason}`, deliveryStatus);
  }

  return items.length;
}
