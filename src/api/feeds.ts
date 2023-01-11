import { getAccountIdList } from '../domain/account';
import {
  alterExistingFeed,
  feedExists,
  isFeedNotFound,
  loadFeed,
  loadFeedsByAccountId,
  makeFeedHashingSalt,
} from '../domain/feed';
import { makeFeed, storeFeed } from '../domain/feed';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isEmpty, isNotEmpty } from '../shared/array-utils';
import { getRandomString } from '../shared/crypto';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const updateFeed: RequestHandler = async function updateFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: updateFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeInputError('Not authenticated');
  }

  const feedHashingSalt = makeFeedHashingSalt(getRandomString(16));

  if (isErr(feedHashingSalt)) {
    logError(si`Failed to ${makeFeedHashingSalt.name}`, feedHashingSalt);
    return makeAppError('Application error!');
  }

  const newFeed = makeFeed(reqBody, feedHashingSalt);

  if (isErr(newFeed)) {
    logError(si`Failed to ${makeFeed.name}`, newFeed);
    return makeInputError(newFeed.reason, newFeed.field);
  }

  const { accountId } = session;
  const loadFeedResult = loadFeed(accountId, newFeed.id, app.storage);

  if (isErr(loadFeedResult)) {
    logError(si`Failed to ${loadFeed.name}`, { reason: loadFeedResult.reason });
    return makeAppError('Application error!');
  }

  if (isFeedNotFound(loadFeedResult)) {
    logError(si`Feed not found for update`, { feedId: newFeed.id.value, accountId: accountId.value });
    return makeAppError('Application error!');
  }

  const existingdFeed = loadFeedResult;
  const alterExistingFeedResult = alterExistingFeed(accountId, existingdFeed, newFeed, app.storage);

  if (isErr(alterExistingFeedResult)) {
    logError(si`Failed to ${alterExistingFeed.name}`, {
      reason: alterExistingFeedResult.reason,
      existingdFeed,
      newFeed,
    });
    return makeAppError('Application error!');
  }

  logInfo('Feed updated', { accountId: accountId.value, newFeed });

  return makeSuccess('Feed updated');
};

export const createFeed: RequestHandler = async function createFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: createFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeInputError('Not authenticated');
  }

  const feedHashingSalt = makeFeedHashingSalt(getRandomString(16));

  if (isErr(feedHashingSalt)) {
    logError(si`Failed to ${makeFeedHashingSalt.name}`, feedHashingSalt);
    return makeAppError('Application error!');
  }

  const feed = makeFeed(reqBody, feedHashingSalt);

  if (isErr(feed)) {
    logError(si`Failed to ${makeFeed.name}`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  const accountList = getAccountIdList(app.storage);

  if (isErr(accountList)) {
    logError(si`Failed to ${getAccountIdList.name}`, { reason: accountList.reason });
    return makeAppError('Application error!');
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
    return makeAppError('Application error!');
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

export const listFeeds: RequestHandler = async function listFeeds(reqId, _reqBody, _reqParams, reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: listFeeds.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeInputError('Not authenticated');
  }

  const { accountId } = session;
  const result = loadFeedsByAccountId(accountId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${loadFeedsByAccountId.name}`, { reason: result.reason });
    return makeAppError('Failed to load feed list');
  }

  if (!isEmpty(result.feedIdErrs)) {
    logError(si`Failed to load feed IDs for account ${accountId.value}`, { feedIdErrs: result.feedIdErrs });
  }

  if (!isEmpty(result.errs)) {
    logError(si`Failed to load feeds for account ${accountId.value}`, { errs: result.errs });
  }

  if (!isEmpty(result.feedNotFoundIds)) {
    logError(si`Missing feeds for account ${accountId.value}`, {
      feedNotFoundIds: result.feedNotFoundIds,
    });
  }

  const data = result.validFeeds;
  const logData = {};

  return makeSuccess('Feeds!', logData, data);
};
