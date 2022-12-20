import { getFeedsByAccountId } from '../domain/feed';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const createFeed: AppRequestHandler = async function createFeed(
  _reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  _app
) {
  return makeAppError('Not there yet');
};

export const listFeeds: AppRequestHandler = async function listFeeds(_reqId, _reqBody, _reqParams, reqSession, app) {
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
