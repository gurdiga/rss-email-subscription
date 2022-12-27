import { getFeedsByAccountId, makeFeed, storeFeed } from '../domain/feed';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const createFeed: RequestHandler = async function createFeed(_reqId, reqBody, _reqParams, reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: listFeeds.name });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning(`Not authenticated`);
    return makeInputError('Not authenticated');
  }

  const feed = makeFeed(reqBody, app.env.DOMAIN_NAME);

  if (isErr(feed)) {
    logWarning(si`Failed to ${makeFeed.name}`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  // TODO: Check it doesn’t exist already?

  const storeFeedResult = storeFeed(feed, app.storage);

  if (isErr(storeFeedResult)) {
    logError(si`Failed to ${storeFeed.name}`, { reason: storeFeedResult.reason });
    return makeAppError(`Failed to create feed`);
  }

  // TODO

  return makeSuccess('Feed created');
};

export const listFeeds: RequestHandler = async function listFeeds(_reqId, _reqBody, _reqParams, reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: listFeeds.name });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning(`Not authenticated`);
    return makeInputError('Not authenticated');
  }

  const result = getFeedsByAccountId(session.accountId, app.storage, app.env.DOMAIN_NAME);

  if (isErr(result)) {
    logError(si`Failed to ${getFeedsByAccountId.name}`, { reason: result.reason });
    return makeAppError(`Failed to load feed list`);
  }

  if (!isEmpty(result.errs)) {
    logError(si`Errors while loading feeds for account ${session.accountId.value}`, { errs: result.errs });
  }

  if (!isEmpty(result.missingFeeds)) {
    const missingFeedIds = result.missingFeeds.map((x) => x.feedId);

    logWarning(si`Missing feeds for account ${session.accountId.value}`, { missingFeedIds });
  }

  const data = result.validFeeds;
  const logData = {};

  return makeSuccess('Feeds!', logData, data);
};
