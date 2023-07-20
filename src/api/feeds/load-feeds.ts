import { LoadFeedsResponseData, makeUiFeedListItem } from '../../domain/feed';
import { loadFeedsByAccountId } from '../../domain/feed-storage';
import { makeAppError, makeNotAuthenticatedError, makeSuccess } from '../../shared/api-response';
import { isEmpty, isNotEmpty, sortBy } from '../../shared/array-utils';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { AppRequestHandler } from '../app-request-handler';
import { checkSession, isAuthenticatedSession } from '../session';

export const loadFeeds: AppRequestHandler = async function listFeeds(reqId, _reqBody, _reqParams, reqSession, app) {
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
    logError('Failed to load some feed IDs for account', {
      accountId: accountId.value,
      feedIdErrs: result.feedIdErrs,
    });
  }

  if (isNotEmpty(result.errs)) {
    logError('Failed to load some feeds for account', {
      accountId: accountId.value,
      errs: result.errs,
    });
  }

  if (isNotEmpty(result.feedNotFoundIds)) {
    logError('Missing some feeds for account', {
      accountId: accountId.value,
      feedNotFoundIds: result.feedNotFoundIds,
    });
  }

  const someErrs = isNotEmpty(result.feedIdErrs) || isNotEmpty(result.errs);
  const noSuccesses = isEmpty(result.validFeeds);
  const somethingIsWrong = noSuccesses && someErrs;

  if (somethingIsWrong) {
    logError('Some load errors and no success', {
      errs: result.errs,
      feedIdErrs: result.feedIdErrs,
    });
    return makeAppError();
  }

  const logData = {};
  const responseData: LoadFeedsResponseData = result.validFeeds
    .map(makeUiFeedListItem)
    .sort(sortBy((x) => x.displayName.toLowerCase()));

  return makeSuccess('Feeds!', logData, responseData);
};
