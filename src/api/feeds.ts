import { getFeedsByAccountId, makeFeed } from '../domain/feed';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const createFeed: RequestHandler = async function createFeed(_reqId, reqBody, _reqParams, reqSession, app) {
  const { logWarning } = makeCustomLoggers({ module: listFeeds.name });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning(`Not authenticated`);
    return makeInputError('Not authenticated');
  }

  const feed = makeFeed(reqBody, app.env.DOMAIN_NAME);

  if (isErr(feed)) {
    logWarning(`Invalid feed`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  // TODO

  return makeAppError('TODO');
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
  const logData = { accountId: session.accountId };

  return makeSuccess('Feeds!', logData, data);
};
