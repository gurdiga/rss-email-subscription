import { getFeedsByAccountId, makeFeed, storeFeed } from '../domain/feed';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
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
    logWarning(`${makeFeed.name} failed`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  // TODO: Check it doesn’t exist already?

  const storeFeedResult = storeFeed(feed, app.storage);

  if (isErr(storeFeedResult)) {
    logError(`${storeFeed.name} failed`, { reason: storeFeedResult.reason });
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
    logError(`Failed to ${getFeedsByAccountId.name}`, { reason: result.reason });
    return makeAppError(`Failed to load feed list`);
  }

  if (!isEmpty(result.errs)) {
    logError(`Errors while loading feeds for account ${session.accountId}`, { errs: result.errs });
  }

  if (!isEmpty(result.missingFeeds)) {
    const missingFeedIds = result.missingFeeds.map((x) => x.feedId);

    logWarning(`Missing feeds for account ${session.accountId}`, { missingFeedIds });
  }

  const data = result.validFeeds;
  const logData = {};

  return makeSuccess('Feeds!', logData, data);
};
