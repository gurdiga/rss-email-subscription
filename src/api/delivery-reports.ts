import { makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { Result, isErr, makeErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { AppRequestHandler } from './app-request-handler';
import { makeDeliveryReportsRequest, DeliveryReportsRequestData, DeliveryReports } from '../domain/delivery-reports.ts';
import { checkSession, isAuthenticatedSession } from './session';
import { FeedId } from '../domain/feed-id';
import { AccountId } from '../domain/account';
import { AppStorage } from '../domain/storage';
import { getDeliveryReportsRootStorageKey } from '../app/email-sending/item-delivery';
import { FeedNotFound, getFeedRootStorageKey, makeFeedNotFound } from '../domain/feed-storage';

export const deliveryReports: AppRequestHandler = async function deliveryReports(
  reqId,
  _reqBody,
  reqParams,
  reqSession,
  { storage }
) {
  const { logWarning } = makeCustomLoggers({ module: deliveryReports.name, reqId });
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
  const reports = makeDeliveryReports(storage, accountId, request.feedId);

  return makeSuccess('OK', {}, { reports });
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

  return dirNames;
}
