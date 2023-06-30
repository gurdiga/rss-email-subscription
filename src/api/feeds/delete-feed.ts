import { DeleteFeedRequest } from '../../domain/feed';
import { makeFeedId } from '../../domain/feed-id';
import { deleteFeed as deleteFeed1 } from '../../domain/feed-storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../../shared/api-response';
import { Result, isErr, makeValues } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { AppRequestHandler } from '../app-request-handler';
import { checkSession, isAuthenticatedSession } from '../session';

export const deleteFeed: AppRequestHandler = async function deleteFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: deleteFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  const request = makeDeleteFeedRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeDeleteFeedRequest.name}`, { reason: request.reason });
    return makeInputError(request.reason, request.field);
  }

  const { feedId } = request;
  const { accountId } = session;
  const result = deleteFeed1(accountId, feedId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${deleteFeed.name}`, { reason: result.reason, accountId: accountId.value });
    return makeAppError('Failed to delete feed');
  }

  logInfo('Feed deleted', { feedId: feedId.value, accountId: accountId.value });

  return makeSuccess('Feed deleted');
};

function makeDeleteFeedRequest(data: unknown): Result<DeleteFeedRequest> {
  return makeValues<DeleteFeedRequest>(data, {
    feedId: makeFeedId,
  });
}
