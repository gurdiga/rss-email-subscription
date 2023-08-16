import { makeEmailContent, makeUnsubscribeUrl } from '../../app/email-sending/email-content';
import { sendEmail } from '../../app/email-sending/email-delivery';
import { FullEmailAddress, makeFullEmailAddress } from '../../app/email-sending/emails';
import { parseRssFeed } from '../../app/rss-checking/rss-parsing';
import { fetchRss } from '../../app/rss-checking/rss-response';
import { isAccountNotFound } from '../../domain/account';
import { loadAccount } from '../../domain/account-storage';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { makeEmailAddress, makeEmailAddressFromFeedId } from '../../domain/email-address-making';
import {
  PublicShowSampleEmailRequest,
  PublicShowSampleEmailResponse,
  ShowSampleEmailRequest,
  makeFeedUrl,
  makeFullItemText,
} from '../../domain/feed';
import { makeFeedId, makeSampleFeedId } from '../../domain/feed-id';
import { isFeedNotFound, loadFeed } from '../../domain/feed-storage';
import { RssItem } from '../../domain/rss-item';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../../shared/api-response';
import { isEmpty } from '../../shared/array-utils';
import { Result, isErr, makeErr, makeValues } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { AppRequestHandler } from '../app-request-handler';
import { AppEnv } from '../init-app';
import { checkSession, isAuthenticatedSession } from '../session';

export const showSampleEmail: AppRequestHandler = async function showSampleEmail(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { env, storage }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: showSampleEmail.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  const request = makeShowSampleEmailReques(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeShowSampleEmailReques.name}`, { reason: request.reason });
    return makeInputError(request.reason, request.field);
  }

  const { accountId } = session;
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name} for sending sample email`, { reason: account.reason });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logError(si`Account not found for sending sample email?!`);
    return makeAppError();
  }

  const { feedId } = request;
  const feed = loadFeed(accountId, feedId, storage);

  if (isErr(feed)) {
    logError(si`Failed to ${loadFeed.name} for sending sample email`, { reason: feed.reason });
    return makeAppError();
  }

  if (isFeedNotFound(feed)) {
    logError(si`Feed not found for sending sample email?!`);
    return makeAppError();
  }

  const feedInfo = await getFeedInfo(feed.url);

  if (isErr(feedInfo)) {
    logError(si`Failed to ${getFeedInfo.name}: ${feedInfo.reason}`, {
      feedId: feedId.value,
      feedUrl: feed.url.toString(),
    });
    return makeAppError('Failed to get latest blog post');
  }

  const feedEmailAddress = makeEmailAddressFromFeedId(feedId, env.DOMAIN_NAME);
  const sender = makeFullEmailAddress(feed.displayName, feedEmailAddress);
  const recipient = makeRecipientForSampleEmail(account.email);
  const unsubscribeUrl = makeUnsubscribeUrl(feed.id, recipient, feed.displayName, env.DOMAIN_NAME);

  const result = await sendSampleEmail(env, recipient, sender, feedInfo.mostRecentItem, unsubscribeUrl);

  if (isErr(result)) {
    logError(si`Failed to ${sendSampleEmail.name}: ${result.reason}`);
    return makeAppError('Failed to send the sample email');
  }

  return makeSuccess(
    si`Please check ${account.email.value}.` +
      ' We’ve sent you a sample email with the most recent post from this blog feed.'
  );
};

interface FeedInfo {
  title: string;
  mostRecentItem: RssItem;
}

async function getFeedInfo(url: URL): Promise<Result<FeedInfo>> {
  const rssResponse = await fetchRss(url);

  if (isErr(rssResponse)) {
    return makeErr(si`Failed to ${fetchRss.name}: ${rssResponse.reason}`);
  }

  const rssParsingResult = await parseRssFeed(rssResponse);

  if (isErr(rssParsingResult)) {
    return makeErr(si`Failed to ${parseRssFeed.name}: ${rssParsingResult.reason}`);
  }

  const { title, validItems, invalidItems } = rssParsingResult;

  if (isEmpty(validItems) && isEmpty(invalidItems)) {
    return makeErr('No RSS items');
  }

  const mostRecentItem = validItems[0];

  if (!mostRecentItem) {
    return makeErr('No valid RSS items');
  }

  const result: FeedInfo = {
    title,
    mostRecentItem,
  };

  return result;
}

async function sendSampleEmail(
  env: AppEnv,
  recipient: HashedEmail,
  sender: FullEmailAddress,
  mostRecentPost: RssItem,
  unsubscribeUrl: URL
) {
  const emailBodySpec = makeFullItemText();
  const emailContent = makeEmailContent(mostRecentPost, unsubscribeUrl, sender.emailAddress, emailBodySpec);

  return await sendEmail(sender, recipient.emailAddress, sender.emailAddress, emailContent, env);
}

export function makeRecipientForSampleEmail(emailAddress: EmailAddress): HashedEmail {
  const recipient: HashedEmail = {
    kind: 'HashedEmail',
    emailAddress,
    isConfirmed: false,
    saltedHash: 'sample_salted_hash',
  };

  return recipient;
}

function makeShowSampleEmailReques(data: unknown) {
  return makeValues<ShowSampleEmailRequest>(data, {
    feedId: makeFeedId,
  });
}

export const showSampleEmailPublic: AppRequestHandler = async function showSampleEmailPublic(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: showSampleEmailPublic.name, reqId });
  const request = makePublicShowSampleEmailReques(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makePublicShowSampleEmailReques.name}`, { reason: request.reason });
    return makeInputError(request.reason, request.field);
  }

  const { feedUrl, recipientEmail } = request;
  const feedInfo = await getFeedInfo(feedUrl);

  if (isErr(feedInfo)) {
    logError(si`Failed to ${getFeedInfo.name}: ${feedInfo.reason}`, { feedUrl: feedUrl.toString() });
    return makeAppError('Failed to get latest blog post');
  }

  const recipient = makeRecipientForSampleEmail(recipientEmail);
  const feedEmailAddress = makeEmailAddressFromFeedId(makeSampleFeedId(), env.DOMAIN_NAME);
  const sender = makeFullEmailAddress(feedInfo.title, feedEmailAddress);
  const unsubscribeUrl = makeUnsubscribeUrl(makeSampleFeedId(), recipient, feedInfo.title, env.DOMAIN_NAME);

  const result = await sendSampleEmail(env, recipient, sender, feedInfo.mostRecentItem, unsubscribeUrl);

  if (isErr(result)) {
    logError(si`Failed to ${sendSampleEmail.name}: ${result.reason}`);
    return makeAppError('Failed to send the sample email');
  }

  const logData = {};
  const responseData: PublicShowSampleEmailResponse = {
    emailSubject: feedInfo.mostRecentItem.title,
    sender: si`${sender.displayName} <${sender.emailAddress.value}>`,
  };

  return makeSuccess('Email sent', logData, responseData);
};

function makePublicShowSampleEmailReques(data: unknown) {
  return makeValues<PublicShowSampleEmailRequest>(data, {
    feedUrl: makeFeedUrl,
    recipientEmail: makeEmailAddress,
  });
}
