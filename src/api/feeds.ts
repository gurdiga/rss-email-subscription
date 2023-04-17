import { parse } from 'node-html-parser';
import {
  loadStoredEmails,
  makeEmailHashFn,
  makeHashedEmail,
  parseEmails,
  storeEmails,
} from '../app/email-sending/emails';
import { fetch } from '../app/rss-checking/fetch';
import { AccountId, AccountNotFound, isAccountId, makeAccountNotFound } from '../domain/account';
import { getAccountIdList } from '../domain/account-storage';
import { defaultFeedPattern } from '../domain/cron-pattern';
import {
  AddEmailsRequest,
  AddEmailsResponse,
  AddNewFeedResponseData,
  CheckFeedUrlRequest,
  CheckFeedUrlResponseData,
  DeleteEmailsRequest,
  DeleteEmailsResponse,
  DeleteFeedRequest,
  EditFeedResponse,
  Feed,
  FeedManageScreenRequest,
  FeedManageScreenResponse,
  FeedStatus,
  isAddNewFeedRequestData,
  LoadEmailsResponse,
  LoadFeedsResponseData,
  makeEditFeedRequest,
  makeUiEmailList,
  makeUiFeed,
  makeUiFeedListItem,
  SendingReport,
} from '../domain/feed';
import { makeNewFeedHashingSalt } from '../domain/feed-crypto';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { makeFeed, MakeFeedInput } from '../domain/feed-making';
import {
  applyEditFeedRequest,
  feedExists,
  getFeedLastSendingReportStorageKey,
  isFeedNotFound,
  loadFeed,
  loadFeedsByAccountId,
  markFeedAsDeleted,
  storeFeed,
} from '../domain/feed-storage';
import { AppStorage } from '../domain/storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { isEmpty, isNotEmpty } from '../shared/array-utils';
import {
  asyncAttempt,
  getErrorMessage,
  getTypeName,
  isErr,
  isString,
  makeErr,
  makeNumber,
  makeValues,
  Result,
} from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { makeHttpUrl } from '../shared/url';
import { AppEnv } from './init-app';
import { AppRequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

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

function makeDeleteFeedRequest(data: unknown): Result<DeleteFeedRequest> {
  return makeValues<DeleteFeedRequest>(data, {
    feedId: makeFeedId,
  });
}

// TODO: Refactor towards makeValues<Feed>
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

export const addNewFeed: AppRequestHandler = async function addNewFeed(reqId, reqBody, _reqParams, reqSession, app) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: addNewFeed.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
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
    return makeAppError();
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

  logInfo('New feed added', {
    accountId: accountId.value,
    feed: {
      id: feed.id.value,
      displayName: feed.displayName,
      url: feed.url,
      replyTo: feed.replyTo.value,
      status: feed.status,
    },
  });

  const logData = {};
  const responseData: AddNewFeedResponseData = {
    feedId: feed.id.value,
  };

  return makeSuccess('New feed added. 👍', logData, responseData);
};

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

  logInfo('Feed updated', { editFeedRequest });

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

// TODO: Add api-test
export const handleFeedManageScreen: AppRequestHandler = async function handleFeedManageScreen(
  reqId,
  _reqBody,
  reqParams,
  reqSession,
  { storage, env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: handleFeedManageScreen.name, reqId });
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

  const response = makeFeedManageScreenResponse(request, session.accountId, storage, env);

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
  request: FeedManageScreenRequest,
  accountId: AccountId,
  storage: AppStorage,
  env: AppEnv
): Result<FeedManageScreenResponse> {
  const { feedId } = request;
  const feed = loadFeed(accountId, feedId, storage);

  if (isErr(feed)) {
    return makeErr(si`Failed to ${loadFeed.name}: ${feed.reason}`);
  }

  if (isFeedNotFound(feed)) {
    return makeErr(si`Feed not found: ${feedId.value}`);
  }

  const storedEmails = loadStoredEmails(accountId, feedId, storage);

  if (isErr(storedEmails)) {
    return makeErr(si`Failed to ${loadStoredEmails.name}: ${storedEmails.reason}`);
  }

  const subscriberCount = storedEmails.validEmails.filter((x) => x.isConfirmed).length;
  const domainName = env.DOMAIN_NAME;

  const lastSendingReport = loadLastSendingReport(storage, accountId, feedId);

  if (isErr(lastSendingReport)) {
    return makeErr(si`Failed to ${loadLastSendingReport.name}: ${lastSendingReport.reason}`, lastSendingReport.field);
  }

  return {
    id: feed.id.value,
    displayName: feed.displayName,
    url: feed.url.toString(),
    email: si`${feed.id.value}@${domainName}`,
    replyTo: feed.replyTo.value,
    status: feed.status,
    subscriberCount,
    lastSendingReport,
  };
}

function loadLastSendingReport(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId
): Result<SendingReport | undefined> {
  const storageKey = getFeedLastSendingReportStorageKey(accountId, feedId);
  const dataExists = storage.hasItem(storageKey);

  if (isErr(dataExists)) {
    return makeErr(si`Failed to check ${storage.hasItem.name}: ${dataExists.reason}`);
  }

  if (dataExists === false) {
    return undefined;
  }

  const data = storage.loadItem(storageKey);

  if (isErr(data)) {
    return makeErr(si`Failed to ${storage.loadItem.name}: ${data.reason}`);
  }

  const report = makeSendingReport(data);

  if (isErr(report)) {
    return makeErr(si`Failed to ${makeSendingReport.name}: ${report.reason}`, report.field);
  }

  return report;
}

function makeSendingReport(data: unknown): Result<SendingReport> {
  return makeValues<SendingReport>(data, {
    newItems: makeNumber,
    subscribers: makeNumber,
    sentExpected: makeNumber,
    sent: makeNumber,
    failed: makeNumber,
  });
}

export const loadFeedById: AppRequestHandler = async function loadFeedById(
  reqId,
  _reqBody,
  reqParams,
  reqSession,
  app
) {
  const { logWarning } = makeCustomLoggers({ module: loadFeedById.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqParams['feedId']); // TODO: add {make,}LoadFeed{Request,Response}Data so that "feedId" is not hard-coded here

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

  const responseData = makeUiFeed(feed, app.env.DOMAIN_NAME);
  const logData = {};

  return makeSuccess('Feed', logData, responseData);
};

export const loadFeedSubscribers: AppRequestHandler = async function loadFeedSubscribers(
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

export const deleteFeedSubscribers: AppRequestHandler = async function deleteFeedSubscribers(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  app
) {
  const { logWarning, logError } = makeCustomLoggers({ module: deleteFeedSubscribers.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqBody['feedId']);

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

export const addFeedSubscribers: AppRequestHandler = async function addFeedSubscribers(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  app
) {
  const { logWarning, logError } = makeCustomLoggers({ module: addFeedSubscribers.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const feedId = makeFeedId(reqBody['feedId']);

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

export const checkFeedUrl: AppRequestHandler = async function checkFeedUrl(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  _app
) {
  const { logInfo, logWarning } = makeCustomLoggers({ module: checkFeedUrl.name, reqId });
  const fieldName: keyof CheckFeedUrlResponseData = 'feedUrl';
  const request = makeCheckFeedUrlRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeCheckFeedUrlRequest.name}`, { reason: request.reason, feedUrl: reqBody[fieldName] });
    return makeInputError(request.reason, fieldName);
  }

  const { blogUrl } = request;
  const response = await asyncAttempt(() => fetch(blogUrl));

  if (isErr(response)) {
    logWarning('Could not fetch blog URL', { blogUrl, reason: response.reason });
    return makeInputError('Could not load that blog. 🤔', fieldName);
  }

  const contentType = response.headers.get('content-type');

  if (!contentType?.startsWith('text/html')) {
    logWarning('Invalid blog Content-Type', { blogUrl, contentType });
    return makeInputError('Your blog seems to have an invalid Content-Type header. 🤔', fieldName);
  }

  const html = await response.text();
  const feedHref = getFeedHref(html);

  if (isErr(feedHref)) {
    logWarning(si`Failed to ${getFeedHref.name}`, { reason: feedHref.reason });
    return makeInputError(feedHref.reason, fieldName);
  }

  const baseURL = feedHref.startsWith('/') ? blogUrl : undefined;
  const feedUrl = makeHttpUrl(feedHref, baseURL, fieldName);

  if (isErr(feedUrl)) {
    logWarning(si`Failed to ${makeHttpUrl.name}`, { reason: feedUrl.reason, feedHref, baseURL });
    return makeInputError(feedUrl.reason, fieldName);
  }

  const logData = {};
  const responseData: CheckFeedUrlResponseData = { feedUrl: feedUrl.toString() };

  logInfo('Blog RSS check', { blogUrl });

  return makeSuccess('OK', logData, responseData);
};

export function getFeedHref(html: string, parseFn = parse): Result<string> {
  try {
    const dom = parseFn(html.toLowerCase());

    const rssLinkTypes = ['application/atom+xml', 'application/rss+xml'];
    const rssLinkSelectors = rssLinkTypes.map((type) => si`link[type="${type}"]`).join(',');
    const link = dom.querySelector(rssLinkSelectors);

    if (!link) {
      return makeErr('RSS feed not found');
    }

    const linkHref = link.getAttribute('href')?.trim();

    if (!linkHref) {
      return makeErr('Feed <link> has no "ref"');
    }

    return linkHref;
  } catch (error) {
    return makeErr(si`Failed to parse HTML: ${getErrorMessage(error)}`);
  }
}

function makeCheckFeedUrlRequest(data: unknown): Result<CheckFeedUrlRequest> {
  return makeValues<CheckFeedUrlRequest>(data, {
    blogUrl: makeBlogUrl,
  });
}

export function makeBlogUrl(value: string, fieldName?: string): Result<URL> {
  if (!(value.startsWith('http://') || value.startsWith('https://'))) {
    value = 'https://' + value;
  }

  const url = makeHttpUrl(value, undefined, fieldName);
  const isIp = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

  if (isErr(url)) {
    return url;
  }

  if (url.hostname === 'localhost') {
    return makeErr('No messing around');
  }

  if (isIp.test(url.host)) {
    return makeErr('Please use a domain name');
  }

  return url;
}
