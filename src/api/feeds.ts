import { feedExists, loadFeedsByAccountId, makeFeed, storeFeed } from '../domain/feed';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const updateFeed: RequestHandler = async function updateFeed(_reqId, _reqBody, reqParams, _reqSession, _app) {
  return makeAppError(si`Not implemented, but here are the route params ${JSON.stringify(reqParams)}`);
};

export const createFeed: RequestHandler = async function createFeed(_reqId, reqBody, _reqParams, reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: listFeeds.name });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeInputError('Not authenticated');
  }

  const feed = makeFeed(reqBody);

  if (isErr(feed)) {
    logError(si`Failed to ${makeFeed.name}`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  const accountId = session.accountId;
  const feedExistsResult = feedExists(feed.id, app.storage);

  if (isErr(feedExistsResult)) {
    logError(si`Failed to check if ${feedExists.name}`, { reason: feedExistsResult.reason });
    return makeAppError('Application error!');
  }

  if (feedExistsResult === true) {
    logWarning(si`Feed ID taken: ${feed.id.value}`);
    return makeInputError('Feed ID taken');
  }

  const storeFeedResult = storeFeed(accountId, feed, app.storage);

  if (isErr(storeFeedResult)) {
    logError(si`Failed to ${storeFeed.name}`, { reason: storeFeedResult.reason });
    return makeAppError('Failed to create feed');
  }

  return makeSuccess('Feed created');
};

export const listFeeds: RequestHandler = async function listFeeds(_reqId, _reqBody, _reqParams, reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: listFeeds.name });
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
