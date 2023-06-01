import { EditFeedResponse, makeEditFeedRequest } from '../../domain/feed';
import { applyEditFeedRequest } from '../../domain/feed-storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../../shared/api-response';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { AppRequestHandler } from '../app-request-handler';
import { checkSession, isAuthenticatedSession } from '../session';

export const editFeed: AppRequestHandler = async function editFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: editFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
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
    return makeAppError();
  }

  logInfo('Feed updated', { accountId: accountId.value, editFeedRequest });

  const logData = {};
  const responseData: EditFeedResponse = {
    feedId: editFeedRequest.id.value,
  };

  return makeSuccess('Feed updated. 👍', logData, responseData);
};
