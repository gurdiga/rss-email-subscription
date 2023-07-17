import { AccountId, AccountNotFound, isAccountId, makeAccountNotFound } from '../../domain/account';
import { AddNewFeedResponseData, Feed, FeedStatus, isAddNewFeedRequestData } from '../../domain/feed';
import { MakeFeedInput, makeFeed } from '../../domain/feed-making';
import { feedExists, storeFeed } from '../../domain/feed-storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../../shared/api-response';
import { Result, isErr, makeErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { AppRequestHandler } from '../app-request-handler';
import { checkSession, isAuthenticatedSession } from '../session';
import { defaultFeedPattern } from '../../domain/cron-pattern';
import { makeNewFeedHashingSalt } from '../../domain/feed-crypto';
import { getAccountIdList } from '../../domain/account-storage';
import { FeedId } from '../../domain/feed-id';
import { AppStorage } from '../../domain/storage';
import { isNotEmpty, isEmpty } from '../../shared/array-utils';

export const addNewFeed: AppRequestHandler = async function addNewFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: addNewFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  const feed = makeFeedFromAddNewFeedRequestData(reqBody);

  if (isErr(feed)) {
    logError(si`Failed to ${makeFeed.name}`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  const feedAccountId = getFeedAccountId(feed.id, app.storage, reqId);

  if (isErr(feedAccountId)) {
    logError(si`Failed to check if ${getFeedAccountId.name}`, { reason: feedAccountId.reason });
    return makeAppError();
  }

  if (isAccountId(feedAccountId)) {
    const errorMessage =
      feedAccountId.value === session.accountId.value ? 'You already have a feed with this ID' : 'Feed ID is taken';

    logWarning(errorMessage, { feedId: feed.id.value });

    return makeInputError(errorMessage, 'id');
  }

  const { accountId } = session;
  const storeFeedResult = storeFeed(accountId, feed, app.storage);

  if (isErr(storeFeedResult)) {
    logError(si`Failed to ${storeFeed.name}`, { reason: storeFeedResult.reason });
    return makeAppError('Failed to create feed');
  }

  logInfo('New feed added', {
    accountId: accountId.value,
    feed: {
      id: feed.id.value,
      displayName: feed.displayName,
      url: feed.url,
      replyTo: feed.replyTo.value,
      status: feed.status,
    },
  });

  const logData = {};
  const responseData: AddNewFeedResponseData = {
    feedId: feed.id.value,
  };

  return makeSuccess('New feed added. 👍', logData, responseData);
};

function makeFeedFromAddNewFeedRequestData(requestData: unknown): Result<Feed> {
  if (!isAddNewFeedRequestData(requestData)) {
    return makeErr('Invalid request');
  }

  const feedHashingSalt = makeNewFeedHashingSalt();
  const cronPattern = defaultFeedPattern;

  const makeFeedInput: MakeFeedInput = {
    displayName: requestData.displayName,
    url: requestData.url,
    id: requestData.id,
    replyTo: requestData.replyTo,
    status: FeedStatus.AwaitingReview,
  };

  return makeFeed(makeFeedInput, feedHashingSalt, cronPattern);
}

export function getFeedAccountId(
  feedId: FeedId,
  storage: AppStorage,
  reqId: string
): Result<AccountId | AccountNotFound> {
  const { logWarning, logError } = makeCustomLoggers({ module: getFeedAccountId.name, feedId: feedId.value, reqId });
  const accountIdList = getAccountIdList(storage);

  if (isErr(accountIdList)) {
    logError(si`Failed to ${getAccountIdList.name}`, { reason: accountIdList.reason });
    return makeErr(si`Failed to ${getAccountIdList.name}`);
  }

  const { accountIds, errs } = accountIdList;

  if (isNotEmpty(errs)) {
    logWarning(si`Some account subdirectory names are invalid account IDs`, {
      errs: errs.map((x) => x.reason),
    });
  }

  const feedExistsResult = feedExists(feedId, accountIds, storage);

  if (isErr(feedExistsResult)) {
    return feedExistsResult;
  }

  if (!isEmpty(feedExistsResult.errs)) {
    logWarning(si`Some errors while checking ${feedExists.name}`, {
      errs: feedExistsResult.errs.map((x) => x.reason),
    });
  }

  if (feedExistsResult.does === false) {
    return makeAccountNotFound();
  }

  const accountId = feedExistsResult.does;

  return accountId;
}
