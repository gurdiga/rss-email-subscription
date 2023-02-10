import { getAccountIdList } from '../domain/account';
import { alterExistingFeed, feedExists, isFeedNotFound, loadFeed, loadFeedsByAccountId } from '../storage/feed-storage';
import { makeFeedHashingSalt, makeUiFeedListItem, makeUiFeed } from '../domain/feed';
import { makeFeedId } from '../domain/feed-id';
import { makeFeed } from '../domain/feed-making';
import { markFeedAsDeleted, storeFeed } from '../storage/feed-storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { isNotEmpty } from '../shared/array-utils';
import { getRandomString } from '../shared/crypto';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';
import { loadStoredEmails } from '../app/email-sending/emails';
import { makeUnixCronPattern } from '../domain/cron-pattern-making';

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

export const updateFeed: RequestHandler = async function updateFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: updateFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const feedHashingSalt = makeFeedHashingSalt(getRandomString(16));

  if (isErr(feedHashingSalt)) {
    logError(si`Failed to ${makeFeedHashingSalt.name}`, feedHashingSalt);
    return makeAppError('Application error!');
  }

  const cronPattern = makeUnixCronPattern(reqBody.cronPattern);

  if (isErr(cronPattern)) {
    logError(si`Failed to ${makeUnixCronPattern.name}`, cronPattern);
    return makeAppError('Application error!');
  }

  const newFeed = makeFeed(reqBody, feedHashingSalt, cronPattern);

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
    return makeNotAuthenticatedError();
  }

  const feedHashingSalt = makeFeedHashingSalt(getRandomString(16));

  if (isErr(feedHashingSalt)) {
    logError(si`Failed to ${makeFeedHashingSalt.name}`, feedHashingSalt);
    return makeAppError('Application error!');
  }

  const cronPattern = makeUnixCronPattern(reqBody.cronPattern);

  if (isErr(cronPattern)) {
    logError(si`Failed to ${makeUnixCronPattern.name}`, cronPattern);
    return makeAppError('Application error!');
  }

  const feed = makeFeed(reqBody, feedHashingSalt, cronPattern);

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
  const { logWarning } = makeCustomLoggers({ module: listFeeds.name, reqId });
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
    logWarning(si`Feed to load not found`, { feedId: feed.feedId, accountId: accountId.value });
    return makeAppError(si`Failed to load feed`);
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
