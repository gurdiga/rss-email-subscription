import { getAccountIdList } from '../domain/account';
import { applyEditFeedRequest, feedExists, FeedExistsResult, isFeedNotFound, loadFeed } from '../storage/feed-storage';
import { loadFeedsByAccountId } from '../storage/feed-storage';
import { makeFeedHashingSalt, makeUiFeedListItem, makeUiFeed, AddNewFeedResponseData } from '../domain/feed';
import { EditFeedResponseData, makeEditFeedRequest } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { makeFeed } from '../domain/feed-making';
import { markFeedAsDeleted, storeFeed } from '../storage/feed-storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { isNotEmpty } from '../shared/array-utils';
import { getRandomString } from '../shared/crypto';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';
import { loadStoredEmails } from '../app/email-sending/emails';
import { makeUnixCronPattern } from '../domain/cron-pattern-making';
import { defaultFeedPattern } from '../domain/cron-pattern';
import { AppStorage } from '../storage/storage';

export const deleteFeed: RequestHandler = async function deleteFeed(reqId, _reqBody, reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: deleteFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqParams['feedId']);

  if (isErr(feedId)) {
    logWarning(si`Failed to ${makeFeedId.name}`, { reason: feedId.reason });
    return makeInputError(si`Invalid feedId: ${feedId.reason}`);
  }

  const { accountId } = session;
  const result = markFeedAsDeleted(accountId, feedId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${markFeedAsDeleted.name}`, { reason: result.reason, accountId: accountId.value });
    return makeAppError('Failed to delete feed');
  }

  if (isFeedNotFound(result)) {
    logWarning('Feed to delete not found', { feedId: result.feedId, accountId: accountId.value });
    return makeInputError('Feed not found');
  }

  logInfo('Feed deleted', { feedId: feedId.value });

  return makeSuccess('Feed deleted');
};

export const addNewFeed: RequestHandler = async function addNewFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: addNewFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const feedHashingSalt = makeFeedHashingSalt(getRandomString(16));

  if (isErr(feedHashingSalt)) {
    logError(si`Failed to ${makeFeedHashingSalt.name}`, feedHashingSalt);
    return makeAppError('Application error');
  }

  const cronPattern = defaultFeedPattern;
  const feed = makeFeed(reqBody, feedHashingSalt, cronPattern);

  if (isErr(feed)) {
    logError(si`Failed to ${makeFeed.name}`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  const feedExistsResult = checkIfFeedExists(feed.id, app.storage, reqId);

  if (isErr(feedExistsResult)) {
    logError(si`Failed to check if ${feedExists.name}`, { reason: feedExistsResult.reason });
    return makeAppError('Application error');
  }

  if (feedExistsResult.does) {
    const errorMessage =
      feedExistsResult.does.value === session.accountId.value
        ? 'You already have a feed with this ID'
        : 'Feed ID is taken';

    logWarning(si`${errorMessage}: ${feed.id.value}`);

    return makeInputError(errorMessage, 'id');
  }

  const { accountId } = session;
  const storeFeedResult = storeFeed(accountId, feed, app.storage);

  if (isErr(storeFeedResult)) {
    logError(si`Failed to ${storeFeed.name}`, { reason: storeFeedResult.reason });
    return makeAppError('Failed to create feed');
  }

  logInfo('New feed added', { accountId: accountId.value, feed });

  const logData = {};
  const responseData: AddNewFeedResponseData = {
    feedId: feed.id.value,
  };

  return makeSuccess('New feed added. 👍', logData, responseData);
};

export const editFeed: RequestHandler = async function editFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: editFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const editFeedRequest = makeEditFeedRequest(reqBody);

  if (isErr(editFeedRequest)) {
    logError(si`Failed to ${makeEditFeedRequest.name}`, {
      field: editFeedRequest.field,
      reason: editFeedRequest.reason,
    });
    return makeInputError(editFeedRequest.reason, editFeedRequest.field);
  }

  const result = applyEditFeedRequest(editFeedRequest, accountId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${applyEditFeedRequest.name}`, { reason: result.reason });
    return makeAppError('Application error');
  }

  const logData = {};
  const responseData: EditFeedResponseData = {
    feedId: editFeedRequest.id.value,
  };

  return makeSuccess('Feed updated. 👍', logData, responseData);
};

function checkIfFeedExists(feedId: FeedId, storage: AppStorage, reqId: number): Result<FeedExistsResult> {
  const { logWarning, logError } = makeCustomLoggers({ module: checkIfFeedExists.name, feedId: feedId.value, reqId });
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

  return feedExists(feedId, accountIds, storage);
}

export const createFeed: RequestHandler = async function createFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: createFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const feedHashingSalt = makeFeedHashingSalt(getRandomString(16));

  if (isErr(feedHashingSalt)) {
    logError(si`Failed to ${makeFeedHashingSalt.name}`, feedHashingSalt);
    return makeAppError('Application error');
  }

  const cronPattern = makeUnixCronPattern(reqBody.cronPattern);

  if (isErr(cronPattern)) {
    logError(si`Failed to ${makeUnixCronPattern.name}`, cronPattern);
    return makeAppError('Application error');
  }

  const feed = makeFeed(reqBody, feedHashingSalt, cronPattern);

  if (isErr(feed)) {
    logError(si`Failed to ${makeFeed.name}`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  const accountList = getAccountIdList(app.storage);

  if (isErr(accountList)) {
    logError(si`Failed to ${getAccountIdList.name}`, { reason: accountList.reason });
    return makeAppError('Application error');
  }

  const { accountIds, errs } = accountList;

  if (isNotEmpty(errs)) {
    logWarning(si`Some account subdirectory names are invalid account IDs`, {
      errs: errs.map((x) => x.reason),
    });
  }

  const feedExistsResult = feedExists(feed.id, accountIds, app.storage);

  if (isErr(feedExistsResult)) {
    logError(si`Failed to check if ${feedExists.name}`, { reason: feedExistsResult.reason });
    return makeAppError('Application error');
  }

  if (feedExistsResult.does) {
    logWarning(si`Feed ID taken: ${feed.id.value}`);
    return makeInputError('Feed ID taken');
  }

  const { accountId } = session;
  const storeFeedResult = storeFeed(accountId, feed, app.storage);

  if (isErr(storeFeedResult)) {
    logError(si`Failed to ${storeFeed.name}`, { reason: storeFeedResult.reason });
    return makeAppError('Failed to create feed');
  }

  logInfo('Feed created', { accountId: accountId.value, feed });

  return makeSuccess('Feed created');
};

export const loadFeeds: RequestHandler = async function listFeeds(reqId, _reqBody, _reqParams, reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: listFeeds.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const result = loadFeedsByAccountId(accountId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${loadFeedsByAccountId.name}`, { reason: result.reason });
    return makeAppError('Failed to load feed list');
  }

  if (isNotEmpty(result.feedIdErrs)) {
    logError(si`Failed to load feed IDs for account ${accountId.value}`, {
      feedIdErrs: result.feedIdErrs.map((x) => x.reason),
    });
  }

  if (isNotEmpty(result.errs)) {
    logError(si`Failed to load feeds for account ${accountId.value}`, {
      errs: result.errs.map((x) => x.reason),
    });
  }

  if (isNotEmpty(result.feedNotFoundIds)) {
    logError(si`Missing feeds for account ${accountId.value}`, {
      feedNotFoundIds: result.feedNotFoundIds,
    });
  }

  const data = result.validFeeds.map(makeUiFeedListItem);
  const logData = {};

  return makeSuccess('Feeds!', logData, data);
};

export const loadFeedById: RequestHandler = async function loadFeedById(reqId, _reqBody, reqParams, reqSession, app) {
  const { logWarning } = makeCustomLoggers({ module: loadFeeds.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqParams['feedId']);

  if (isErr(feedId)) {
    logWarning(si`Failed to ${makeFeedId.name}`, { reason: feedId.reason });
    return makeInputError(si`Invalid feedId: ${feedId.reason}`);
  }

  const { accountId } = session;
  const feed = loadFeed(accountId, feedId, app.storage);

  if (isErr(feed)) {
    logWarning(si`Failed to ${loadFeed.name}`, { reason: feed.reason });
    return makeAppError(si`Failed to load feed`);
  }

  if (isFeedNotFound(feed)) {
    logWarning(si`Feed not found`, { feedId: feed.feedId, accountId: accountId.value });
    return makeAppError(si`Feed not found`);
  }

  const storedEmails = loadStoredEmails(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadStoredEmails.name}`, { reason: storedEmails.reason });
    return makeAppError(si`Failed to load subscriber list`);
  }

  const subscriberCount = storedEmails.validEmails.length;
  const data = makeUiFeed(feed, app.env.DOMAIN_NAME, subscriberCount);
  const logData = {};

  return makeSuccess('Feed', logData, data);
};
