import { diffString } from 'json-diff';
import { isAccountId } from '../../domain/account';
import { EditFeedResponse, Feed, makeEditFeedRequest } from '../../domain/feed';
import { applyEditFeedRequest } from '../../domain/feed-storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../../shared/api-response';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { AppRequestHandler } from '../app-request-handler';
import { checkSession, isAuthenticatedSession } from '../session';
import { getFeedAccountId } from './add-new-feed';

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

  const feedAccountId = getFeedAccountId(editFeedRequest.id, app.storage, reqId);

  if (isErr(feedAccountId)) {
    logError(si`Failed to check if ${getFeedAccountId.name}`, { reason: feedAccountId.reason });
    return makeAppError();
  }

  const feedIdHasChanged = editFeedRequest.id.value != editFeedRequest.initialId.value;

  if (feedIdHasChanged && isAccountId(feedAccountId)) {
    const errorMessage =
      feedAccountId.value === session.accountId.value // prettier: keep these stacked
        ? 'You already have a feed with this ID'
        : 'Feed ID is taken';

    logWarning(errorMessage, {
      id: editFeedRequest.id.value,
      initialId: editFeedRequest.initialId.value,
    });

    return makeInputError(errorMessage, 'id');
  }

  const result = applyEditFeedRequest(editFeedRequest, accountId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${applyEditFeedRequest.name}`, { reason: result.reason });
    return makeAppError();
  }

  logInfo('Feed updated', {
    accountId: accountId.value,
    editFeedRequest,
    diff: diffFeed(...result),
  });

  const logData = {};
  const responseData: EditFeedResponse = {
    feedId: editFeedRequest.id.value,
  };

  return makeSuccess('Feed updated. 👍', logData, responseData);
};

export function diffFeed(f1: Feed, f2: Feed) {
  const f1d = diffable(f1);
  const f2d = diffable(f2);

  return diffString(f1d, f2d, { color: false });
}

function diffable(x: any) {
  return JSON.parse(JSON.stringify(x));
}
