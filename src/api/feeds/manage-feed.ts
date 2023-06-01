import { StoredEmailAddresses, loadEmailAddresses } from '../../app/email-sending/emails';
import { Feed, FeedManageScreenRequest, FeedManageScreenResponse } from '../../domain/feed';
import { makeFeedId } from '../../domain/feed-id';
import { isFeedNotFound, loadFeed } from '../../domain/feed-storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../../shared/api-response';
import { Result, isErr, makeValues } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { AppRequestHandler } from '../app-request-handler';
import { checkSession, isAuthenticatedSession } from '../session';

// TODO: Add api-test

export const manageFeed: AppRequestHandler = async function manageFeed(
  reqId,
  _reqBody,
  reqParams,
  reqSession,
  { storage, env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: manageFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const request = makeFeedManageScreenRequest(reqParams);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeFeedManageScreenRequest.name}`, { reason: request.reason });
    return makeInputError(request.reason, request.field);
  }

  const { accountId } = session;
  const { feedId } = request;
  const feed = loadFeed(accountId, feedId, storage);

  if (isErr(feed)) {
    logError(si`Failed to ${loadFeed.name}: ${feed.reason}`, { feedId: feedId.value });
    return makeAppError();
  }

  if (isFeedNotFound(feed)) {
    logError('Feed to manage not found', { feedId: feedId.value });
    return makeAppError('Feed not found');
  }

  const storedEmails = loadEmailAddresses(accountId, feedId, storage);

  if (isErr(storedEmails)) {
    logError(si`Failed to ${loadEmailAddresses.name}: ${storedEmails.reason}`, {
      accountId: accountId.value,
      feedId: feedId.value,
    });
    return makeAppError();
  }

  const response = makeFeedManageScreenResponse(feed, storedEmails, env.DOMAIN_NAME);

  if (isErr(response)) {
    logError(si`Faled to ${makeFeedManageScreenResponse.name}`, { reason: response.reason, field: response.field });
    return makeAppError();
  }

  const logData = {};

  return makeSuccess('Success', logData, response);
};
function makeFeedManageScreenRequest(data: unknown): Result<FeedManageScreenRequest> {
  return makeValues<FeedManageScreenRequest>(data, {
    feedId: makeFeedId,
  });
}
function makeFeedManageScreenResponse(
  feed: Feed,
  storedEmails: StoredEmailAddresses,
  domainName: string
): Result<FeedManageScreenResponse> {
  const subscriberCount = storedEmails.validEmails.filter((x) => x.isConfirmed).length;

  return {
    id: feed.id.value,
    displayName: feed.displayName,
    url: feed.url.toString(),
    email: si`${feed.id.value}@${domainName}`,
    replyTo: feed.replyTo.value,
    status: feed.status,
    subscriberCount,
  };
}
