import * as cheerio from 'cheerio';
import {
  loadEmailAddresses,
  makeEmailHashFn,
  makeHashedEmail,
  parseEmails,
  storeEmails,
} from '../app/email-sending/emails';
import { fetch } from '../app/rss-checking/fetch';
import { fetchRss, isValidFeedContentType } from '../app/rss-checking/rss-response';
import { isAccountNotFound } from '../domain/account';
import {
  AddEmailsRequest,
  AddEmailsResponse,
  CheckFeedUrlRequest,
  CheckFeedUrlResponseData,
  DeleteEmailsRequest,
  DeleteEmailsResponse,
  LoadEmailsResponse,
  LoadFeedDisplayNameResponseData,
  makeUiEmailList,
  makeUiFeed,
} from '../domain/feed';
import { makeFeedId } from '../domain/feed-id';
import { findFeedAccountId, isFeedNotFound, loadFeed } from '../domain/feed-storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import {
  Result,
  asyncAttempt,
  getErrorMessage,
  getTypeName,
  isErr,
  isNonEmptyString,
  isString,
  makeErr,
  makeValues,
} from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { makeHttpUrl } from '../shared/url';
import { AppRequestHandler } from './app-request-handler';
import { checkSession, isAuthenticatedSession, isDemoSession } from './session';

export const loadFeedDisplayName: AppRequestHandler = async function loadFeedDisplayName(
  reqId,
  _reqBody,
  reqParams,
  _reqSession,
  app
) {
  const { logWarning } = makeCustomLoggers({ module: loadFeedDisplayName.name, reqId });
  const feedId = makeFeedId(reqParams['feedId']);

  if (isErr(feedId)) {
    logWarning(si`Failed to ${makeFeedId.name}`, { reason: feedId.reason });
    return makeInputError('Invalid feedId');
  }

  const accountId = findFeedAccountId(feedId, app.storage);

  if (isErr(accountId)) {
    logWarning(si`Failed to ${findFeedAccountId.name}`, { reason: accountId.reason });
    return makeInputError('Feed not found');
  }

  if (isAccountNotFound(accountId)) {
    logWarning(si`Account not found for feed ID ${feedId.value}`);
    return makeInputError('Feed not found');
  }

  const feed = loadFeed(accountId, feedId, app.storage);

  if (isErr(feed)) {
    logWarning(si`Failed to ${loadFeed.name}`, { reason: feed.reason, field: feed.field });
    return makeAppError();
  }

  if (isFeedNotFound(feed)) {
    logWarning(si`Feed not found`, { feedId: feed.feedId, accountId: accountId.value });
    return makeAppError();
  }

  const responseData: LoadFeedDisplayNameResponseData = { displayName: feed.displayName };
  const logData = {};

  return makeSuccess('Success', logData, responseData);
};

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

  const storedEmails = loadEmailAddresses(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadEmailAddresses.name}`, { reason: storedEmails.reason });
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

  const storedEmails = loadEmailAddresses(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadEmailAddresses.name}`, { reason: storedEmails.reason });
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

  const storedEmails = loadEmailAddresses(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadEmailAddresses.name}`, { reason: storedEmails.reason });
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

  const storedEmails = loadEmailAddresses(accountId, feedId, app.storage);

  if (isErr(storedEmails)) {
    logWarning(si`Failed to ${loadEmailAddresses.name}`, { reason: storedEmails.reason });
    return makeAppError(si`Failed to load subscriber list`);
  }

  if (!isEmpty(storedEmails.invalidEmails)) {
    logWarning(si`Failed to load some subscribers`, { invalidEmails: storedEmails.invalidEmails });
    return makeAppError(si`Failed to load some subscribers`);
  }

  const storedEmailStrings = storedEmails.validEmails.map((x) => x.emailAddress.value);
  const emailHashFn = makeEmailHashFn(feed.hashingSalt);
  const defaultConfirmationState = true;
  const newHashedEmails = parseResult.validEmails
    .filter((x) => !storedEmailStrings.includes(x.value))
    .map((x) => makeHashedEmail(x, emailHashFn, defaultConfirmationState));

  const limit = isDemoSession(reqSession) ? 10 : undefined;
  const newEmailsToStore = storedEmails.validEmails.concat(...newHashedEmails).slice(0, limit);
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
  const fieldName: keyof CheckFeedUrlRequest = 'blogUrl';
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

  const contentType = response.headers.get('content-type') || '';
  const isProbablyFeedUrl = isValidFeedContentType(contentType);

  if (isProbablyFeedUrl) {
    const responseData: CheckFeedUrlResponseData = { feedUrl: blogUrl.toString() };
    return makeSuccess('OK', {}, responseData);
  }

  if (!contentType.startsWith('text/html')) {
    logWarning('Invalid blog Content-Type', { blogUrl, contentType });
    return makeInputError('This seems not to be a blog. 🤔', fieldName);
  }

  const html = await response.text();
  const feedHrefs = getFeedHrefs(html);

  if (isErr(feedHrefs)) {
    logWarning(si`Failed to ${getFeedHrefs.name}`, { reason: feedHrefs.reason, blogUrl: blogUrl.toString() });
    return makeInputError(feedHrefs.reason, fieldName);
  }

  // ASSUMPTION: Most of the time, the first one is the post RSS feed,
  // and then, if any, comment feeds, or post feed in other formats.
  let feedHref = feedHrefs[0];

  if (!feedHref) {
    const guessedFeedUrl = await tryGuessingFeedUrl(blogUrl);

    if (guessedFeedUrl) {
      feedHref = guessedFeedUrl;
    }
  }

  if (!feedHref) {
    logWarning('No RSS feed found', { blogUrl: blogUrl.toString() });
    return makeInputError('No RSS feed found', fieldName);
  }

  const feedUrl = makeBlogFeedHttpUrl(feedHref, blogUrl, fieldName);

  if (isErr(feedUrl)) {
    logWarning('Invalid feed URL', { feedHref, blogUrl: blogUrl.toString() });
    return makeInputError('Invalid feed URL', fieldName);
  }

  const logData = {};
  const responseData: CheckFeedUrlResponseData = { feedUrl: feedUrl.toString() };

  logInfo('Blog RSS check', { blogUrl, feedUrl: feedUrl.toString() });

  return makeSuccess('OK', logData, responseData);
};

async function tryGuessingFeedUrl(blogUrl: URL): Promise<string | undefined> {
  const feedPathsToTry = [
    '/feed', // WordPress
    '/rss',
    '/feed.xml',
    '/rss.xml',
    '/atom.xml',
    '/feed/rss/', // nngroup.com
    '/1/feed', // WIX
    '/blog-feed.xml', // WIX
  ];

  for (const feedPath of feedPathsToTry) {
    const feedUrl = new URL(blogUrl.origin + feedPath);
    const rssResponse = await fetchRss(feedUrl);

    if (!isErr(rssResponse)) {
      return feedUrl.toString();
    }
  }

  return undefined;
}

export function makeBlogFeedHttpUrl(href: string, blogUrl: URL, fieldName: string) {
  if (href.startsWith('//')) {
    href = blogUrl.protocol + href;
  }

  const isAbsoluteUrl = href.startsWith('http://') || href.startsWith('https://');
  const baseURL = isAbsoluteUrl ? undefined : blogUrl;

  return makeHttpUrl(href, baseURL, fieldName);
}

export function getFeedHrefs(html: string): Result<string[]> {
  try {
    const $ = cheerio.load(html);

    const rssLinkTypes = ['application/atom+xml', 'application/rss+xml'];
    const rssLinkSelectors = rssLinkTypes.map((type) => si`link[type="${type}"]`).join(',');
    const links = $(rssLinkSelectors);

    const linkHrefs = links
      .map((_index, link) => $(link).attr('href')?.trim())
      .toArray()
      .filter(isNonEmptyString);

    return linkHrefs;
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
