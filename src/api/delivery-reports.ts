import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { Result, isErr, makeErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { AppRequestHandler } from './app-request-handler';
import {
  makeDeliveryReportsRequest,
  DeliveryReportsRequestData,
  DeliveryReports,
  isDeliveryReport,
  makeDeliveryReport,
} from '../domain/delivery-reports';
import { checkSession, isAuthenticatedSession } from './session';
import { FeedId } from '../domain/feed-id';
import { AccountId } from '../domain/account';
import { AppStorage, StorageKey } from '../domain/storage';
import {
  DeliveryStatus,
  PostfixDeliveryStatus,
  SyntheticDeliveryStatus,
  getDeliveredItemDataStorageKey,
  getDeliveryReportsRootStorageKey,
} from '../app/email-sending/item-delivery';
import { FeedNotFound, getFeedRootStorageKey, isFeedNotFound, makeFeedNotFound } from '../domain/feed-storage';
import { isEmpty } from '../shared/array-utils';
import { makePath } from '../shared/path-utils';

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

  return makeSuccess('OK', {}, { reports, results });
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

  const storageKey = getDeliveryReportsRootStorageKey(accountId, feedId);
  const itemsRootExists = storage.hasItem(storageKey);

  if (isErr(itemsRootExists)) {
    return makeErr(si`Failed to check for reports: ${itemsRootExists.reason}`);
  }

  if (itemsRootExists === false) {
    return [];
  }

  const dirNames = storage.listSubdirectories(storageKey);

  if (isErr(dirNames)) {
    return makeErr(si`Failed to list reports: ${dirNames.reason}`);
  }

  return dirNames.map((itemId) => {
    const itemDataStorageKey = getDeliveredItemDataStorageKey(accountId, feedId, itemId);
    const itemData = storage.loadItem(itemDataStorageKey);
    const messageCounts = getMessageCounts(storage, itemDataStorageKey);

    return makeDeliveryReport({ itemId, itemData, messageCounts });
  });
}

function getMessageCounts(storage: AppStorage, itemDataStorageKey: StorageKey): Record<DeliveryStatus, Result<number>> {
  const getMessageCount = (deliveryStatus: DeliveryStatus) => {
    const statusDirStoragKey = makePath(itemDataStorageKey, deliveryStatus);
    const items = storage.listItems(statusDirStoragKey);

    return isErr(items) ? items : items.length;
  };

  return {
    [PostfixDeliveryStatus.Sent]: getMessageCount(PostfixDeliveryStatus.Sent),
    [PostfixDeliveryStatus.Deferred]: getMessageCount(PostfixDeliveryStatus.Deferred),
    [PostfixDeliveryStatus.Bounced]: getMessageCount(PostfixDeliveryStatus.Bounced),
    [SyntheticDeliveryStatus.MailboxFull]: getMessageCount(SyntheticDeliveryStatus.MailboxFull),
  };
}
