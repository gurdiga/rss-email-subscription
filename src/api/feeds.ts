import {
  loadStoredEmails,
  makeEmailHashFn,
  makeHashedEmail,
  parseEmails,
  storeEmails,
} from '../app/email-sending/emails';
import { defaultFeedPattern } from '../domain/cron-pattern';
import {
  AddEmailsRequest,
  AddEmailsResponse,
  AddNewFeedResponseData,
  DeleteEmailsRequest,
  DeleteEmailsResponse,
  DeleteFeedRequest,
  DeleteFeedRequestData,
  EditFeedResponse,
  Feed,
  FeedStatus,
  isAddNewFeedRequestData,
  LoadEmailsResponse,
  LoadFeedsResponseData,
  makeEditFeedRequest,
  makeUiEmailList,
  makeUiFeed,
  makeUiFeedListItem,
} from '../domain/feed';
import { makeNewFeedHashingSalt } from '../domain/feed-crypto';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { makeFeed, MakeFeedInput } from '../domain/feed-making';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { isEmpty, isNotEmpty } from '../shared/array-utils';
import { getTypeName, isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { getAccountIdList } from '../domain/account-storage';
import {
  applyEditFeedRequest,
  feedExists,
  isFeedNotFound,
  loadFeed,
  loadFeedsByAccountId,
  markFeedAsDeleted,
  storeFeed,
} from '../domain/feed-storage';
import { AppStorage } from '../domain/storage';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';
import { AccountId, AccountNotFound, isAccountId, makeAccountNotFound } from '../domain/account';

export const deleteFeed: RequestHandler = async function deleteFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: deleteFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const request = makeDeleteFeedRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeDeleteFeedRequest.name}`, { reason: request.reason });
    return makeInputError(request.reason, request.field);
  }

  const { feedId } = request;
  const { accountId } = session;
  const result = markFeedAsDeleted(accountId, feedId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${markFeedAsDeleted.name}`, { reason: result.reason, accountId: accountId.value });
    return makeAppError('Failed to delete feed');
  }

  if (isFeedNotFound(result)) {
    logWarning('Feed to delete not found', { feedId: result.feedId.value, accountId: accountId.value });
    return makeInputError('Feed not found');
  }

  logInfo('Feed deleted', { feedId: feedId.value });

  return makeSuccess('Feed deleted');
};

function makeDeleteFeedRequest(data: unknown | DeleteFeedRequestData): Result<DeleteFeedRequest> {
  if (!isObject(data)) {
    return makeErr(si`Invalid request data type: expected [object] but got [${getTypeName(data)}]`);
  }

  const idKeyName: keyof DeleteFeedRequestData = 'feedId';

  if (!(idKeyName in data)) {
    return makeErr(si`Invalid request: missing "${idKeyName}"`, idKeyName);
  }

  const feedId = makeFeedId(data.feedId, idKeyName);

  if (isErr(feedId)) {
    return feedId;
  }

  return { feedId };
}

function makeFeedFromAddNewFeedRequestData(requestData: unknown): Result<Feed> {
  if (!isAddNewFeedRequestData(requestData)) {
    return makeErr('Invalid request');
  }

  const feedHashingSalt = makeNewFeedHashingSalt();
  const cronPattern = defaultFeedPattern;

  const makeFeedInput: MakeFeedInput = {
    displayName: requestData.displayName,
    url: requestData.url,
    id: requestData.id,
    replyTo: requestData.replyTo,
    status: FeedStatus.AwaitingReview,
  };

  return makeFeed(makeFeedInput, feedHashingSalt, cronPattern);
}

export const addNewFeed: RequestHandler = async function addNewFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: addNewFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const feed = makeFeedFromAddNewFeedRequestData(reqBody);

  if (isErr(feed)) {
    logError(si`Failed to ${makeFeed.name}`, feed);
    return makeInputError(feed.reason, feed.field);
  }

  const feedAccountId = getFeedAccountId(feed.id, app.storage, reqId);

  if (isErr(feedAccountId)) {
    logError(si`Failed to check if ${getFeedAccountId.name}`, { reason: feedAccountId.reason });
    return makeAppError('Application error');
  }

  if (isAccountId(feedAccountId)) {
    const errorMessage =
      feedAccountId.value === session.accountId.value ? 'You already have a feed with this ID' : 'Feed ID is taken';

    logWarning(errorMessage, { feedId: feed.id.value });

    return makeInputError(errorMessage, 'id');
  }

  const { accountId } = session;
  const storeFeedResult = storeFeed(accountId, feed, app.storage);

  if (isErr(storeFeedResult)) {
    logError(si`Failed to ${storeFeed.name}`, { reason: storeFeedResult.reason });
    return makeAppError('Failed to create feed');
  }

  logInfo('New feed added', { accountId: accountId.value, feed });

  const logData = {};
  const responseData: AddNewFeedResponseData = {
    feedId: feed.id.value,
  };

  return makeSuccess('New feed added. 👍', logData, responseData);
};

export const editFeed: RequestHandler = async function editFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: editFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
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
    return makeAppError('Application error');
  }

  const logData = {};
  const responseData: EditFeedResponse = {
    feedId: editFeedRequest.id.value,
  };

  return makeSuccess('Feed updated. 👍', logData, responseData);
};

function getFeedAccountId(feedId: FeedId, storage: AppStorage, reqId: number): Result<AccountId | AccountNotFound> {
  const { logWarning, logError } = makeCustomLoggers({ module: getFeedAccountId.name, feedId: feedId.value, reqId });
  const accountIdList = getAccountIdList(storage);

  if (isErr(accountIdList)) {
    logError(si`Failed to ${getAccountIdList.name}`, { reason: accountIdList.reason });
    return makeErr(si`Failed to ${getAccountIdList.name}`);
  }

  const { accountIds, errs } = accountIdList;

  if (isNotEmpty(errs)) {
    logWarning(si`Some account subdirectory names are invalid account IDs`, {
      errs: errs.map((x) => x.reason),
    });
  }

  const feedExistsResult = feedExists(feedId, accountIds, storage);

  if (isErr(feedExistsResult)) {
    return feedExistsResult;
  }

  if (!isEmpty(feedExistsResult.errs)) {
    logWarning(si`Some errors while checking ${feedExists.name}`, {
      errs: feedExistsResult.errs.map((x) => x.reason),
    });
  }

  if (feedExistsResult.does === false) {
    return makeAccountNotFound();
  }

  const accountId = feedExistsResult.does;

  return accountId;
}

export const loadFeeds: RequestHandler = async function listFeeds(reqId, _reqBody, _reqParams, reqSession, app) {
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
    logError(si`Failed to load feed IDs for account ${accountId.value}`, {
      feedIdErrs: result.feedIdErrs.map((x) => x.reason),
    });
  }

  if (isNotEmpty(result.errs)) {
    logError(si`Failed to load feeds for account ${accountId.value}`, {
      errs: result.errs.map((x) => x.reason),
    });
  }

  if (isNotEmpty(result.feedNotFoundIds)) {
    logError(si`Missing feeds for account ${accountId.value}`, {
      feedNotFoundIds: result.feedNotFoundIds,
    });
  }

  const logData = {};
  const responseData: LoadFeedsResponseData = result.validFeeds.map(makeUiFeedListItem);

  return makeSuccess('Feeds!', logData, responseData);
};

export const loadFeedById: RequestHandler = async function loadFeedById(reqId, _reqBody, reqParams, reqSession, app) {
  const { logWarning } = makeCustomLoggers({ module: loadFeedById.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqParams['feedId']);

  if (isErr(feedId)) {
    logWarning(si`Failed to ${makeFeedId.name}`, { reason: feedId.reason });
    return makeInputError(si`Invalid feedId: ${feedId.reason}`);
  }

  const { accountId } = session;
  const feed = loadFeed(accountId, feedId, app.storage);

  if (isErr(feed)) {
    logWarning(si`Failed to ${loadFeed.name}`, { reason: feed.reason });
    return makeAppError(si`Failed to load feed`);
  }

  if (isFeedNotFound(feed)) {
    logWarning(si`Feed not found`, { feedId: feed.feedId, accountId: accountId.value });
    return makeAppError(si`Feed not found`);
  }

  const storedEmails = loadStoredEmails(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadStoredEmails.name}`, { reason: storedEmails.reason });
    return makeAppError(si`Failed to load subscriber list`);
  }

  const subscriberCount = storedEmails.validEmails.filter((x) => x.isConfirmed).length;
  const responseData = makeUiFeed(feed, app.env.DOMAIN_NAME, subscriberCount);
  const logData = {};

  return makeSuccess('Feed', logData, responseData);
};

export const loadFeedSubscribers: RequestHandler = async function loadFeedSubscribers(
  reqId,
  _reqBody,
  reqParams,
  reqSession,
  app
) {
  const { logWarning } = makeCustomLoggers({ module: loadFeedSubscribers.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqParams['feedId']);

  if (isErr(feedId)) {
    logWarning(si`Failed to ${makeFeedId.name}`, { reason: feedId.reason });
    return makeInputError(si`Invalid feedId: ${feedId.reason}`);
  }

  const { accountId } = session;
  const feed = loadFeed(accountId, feedId, app.storage);

  if (isErr(feed)) {
    logWarning(si`Failed to ${loadFeed.name}`, { reason: feed.reason });
    return makeAppError(si`Failed to load feed`);
  }

  if (isFeedNotFound(feed)) {
    logWarning(si`Feed not found`, { feedId: feed.feedId, accountId: accountId.value });
    return makeAppError(si`Feed not found`);
  }

  const storedEmails = loadStoredEmails(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadStoredEmails.name}`, { reason: storedEmails.reason });
    return makeAppError(si`Failed to load subscriber list`);
  }

  const logData = {};
  const responseData: LoadEmailsResponse = {
    displayName: feed.displayName,
    emails: makeUiEmailList(storedEmails.validEmails),
  };

  return makeSuccess('Feed subscribers', logData, responseData);
};

export const deleteFeedSubscribers: RequestHandler = async function deleteFeedSubscribers(
  reqId,
  reqBody,
  reqParams,
  reqSession,
  app
) {
  const { logWarning, logError } = makeCustomLoggers({ module: deleteFeedSubscribers.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqParams['feedId']);

  if (isErr(feedId)) {
    logWarning(si`Failed to ${makeFeedId.name}`, { reason: feedId.reason });
    return makeInputError(si`Invalid feedId: ${feedId.reason}`);
  }

  const emails = (reqBody as DeleteEmailsRequest).emailsToDeleteOnePerLine;

  if (!isString(emails)) {
    return makeInputError(si`Invalid emails list: expected [string] but got [${getTypeName(emails)}]`);
  }

  const parseResult = parseEmails(emails);

  if (!isEmpty(parseResult.invalidEmails)) {
    logWarning('Failed to parse some of the emails', { invalidEmails: parseResult.invalidEmails });
    return makeInputError(si`Found a few invalid emails:\n- ${parseResult.invalidEmails.join('\n- ')}`);
  }

  if (isEmpty(parseResult.validEmails)) {
    logWarning('Empty list of emails');
    return makeInputError('Empty emails list');
  }

  const { accountId } = session;
  const feed = loadFeed(accountId, feedId, app.storage);

  if (isErr(feed)) {
    logWarning(si`Failed to ${loadFeed.name}`, { reason: feed.reason });
    return makeAppError(si`Failed to load feed`);
  }

  if (isFeedNotFound(feed)) {
    logWarning(si`Feed not found`, { feedId: feed.feedId, accountId: accountId.value });
    return makeAppError(si`Feed not found`);
  }

  const storedEmails = loadStoredEmails(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadStoredEmails.name}`, { reason: storedEmails.reason });
    return makeAppError(si`Failed to load subscriber list`);
  }

  if (!isEmpty(storedEmails.invalidEmails)) {
    logWarning(si`Failed to load some subscribers`, { invalidEmails: storedEmails.invalidEmails });
    return makeAppError(si`Failed to load some subscribers`);
  }

  const storedEmailStrings = storedEmails.validEmails.map((x) => x.emailAddress.value);
  const receivedEmailStrings = parseResult.validEmails.map((x) => x.value);
  const receivedEmailsNotFound = receivedEmailStrings.filter((x) => !storedEmailStrings.includes(x));

  if (!isEmpty(receivedEmailsNotFound)) {
    logWarning(si`Some emails to delete were not found`, { receivedEmailsNotFound });
    return makeAppError(si`Failed to delete subscribers`);
  }

  const newEmailsToStore = storedEmails.validEmails.filter((x) => !receivedEmailStrings.includes(x.emailAddress.value));
  const result = storeEmails(newEmailsToStore, accountId, feedId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${storeEmails.name}`, { reason: result.reason });
    return makeAppError(si`Failed to delete subscribers`);
  }

  const logData = {};
  const responseData: DeleteEmailsResponse = {
    currentEmails: makeUiEmailList(newEmailsToStore),
  };

  return makeSuccess('Deleted subscribers', logData, responseData);
};

export const addFeedSubscribers: RequestHandler = async function addFeedSubscribers(
  reqId,
  reqBody,
  reqParams,
  reqSession,
  app
) {
  const { logWarning, logError } = makeCustomLoggers({ module: addFeedSubscribers.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqParams['feedId']);

  if (isErr(feedId)) {
    logWarning(si`Failed to ${makeFeedId.name}`, { reason: feedId.reason });
    return makeInputError(si`Invalid feedId: ${feedId.reason}`);
  }

  const emails = (reqBody as AddEmailsRequest).emailsOnePerLine;

  if (!isString(emails)) {
    return makeInputError(si`Invalid emails list: expected [string] but got [${getTypeName(emails)}]`);
  }

  const parseResult = parseEmails(emails);

  if (!isEmpty(parseResult.invalidEmails)) {
    logWarning('Failed to parse some of the emails', { invalidEmails: parseResult.invalidEmails });
    return makeInputError(si`Invalid emails list:\n- ${parseResult.invalidEmails.join('\n- ')}`);
  }

  if (isEmpty(parseResult.validEmails)) {
    logWarning('Empty list of emails');
    return makeInputError('Empty emails list');
  }

  const { accountId } = session;
  const feed = loadFeed(accountId, feedId, app.storage);

  if (isErr(feed)) {
    logWarning(si`Failed to ${loadFeed.name}`, { reason: feed.reason });
    return makeAppError(si`Failed to load feed`);
  }

  if (isFeedNotFound(feed)) {
    logWarning(si`Feed not found`, { feedId: feed.feedId, accountId: accountId.value });
    return makeAppError(si`Feed not found`);
  }

  const storedEmails = loadStoredEmails(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadStoredEmails.name}`, { reason: storedEmails.reason });
    return makeAppError(si`Failed to load subscriber list`);
  }

  if (!isEmpty(storedEmails.invalidEmails)) {
    logWarning(si`Failed to load some subscribers`, { invalidEmails: storedEmails.invalidEmails });
    return makeAppError(si`Failed to load some subscribers`);
  }

  const storedEmailStrings = storedEmails.validEmails.map((x) => x.emailAddress.value);
  const emailHashFn = makeEmailHashFn(feed.hashingSalt);
  const confirmationState = true;
  const newHashedEmails = parseResult.validEmails
    .filter((x) => !storedEmailStrings.includes(x.value))
    .map((x) => makeHashedEmail(x, emailHashFn, confirmationState));
  const newEmailsToStore = storedEmails.validEmails.concat(...newHashedEmails);
  const result = storeEmails(newEmailsToStore, accountId, feedId, app.storage);

  if (isErr(result)) {
    logError(si`Failed to ${storeEmails.name}`, { reason: result.reason });
    return makeAppError(si`Failed to delete subscribers`);
  }

  const logData = {};

  const newEmailsCount = newHashedEmails.length;
  const responseData: AddEmailsResponse = {
    newEmailsCount,
    currentEmails: makeUiEmailList(newEmailsToStore),
  };

  return makeSuccess(si`Added ${newEmailsCount} subscribers`, logData, responseData);
};
