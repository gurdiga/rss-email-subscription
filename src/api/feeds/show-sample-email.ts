import { EmailContent } from '../../app/email-sending/email-content';
import { sendEmail } from '../../app/email-sending/email-delivery';
import { makeFullEmailAddress } from '../../app/email-sending/emails';
import { makeStoredEmailMessageData } from '../../app/email-sending/item-delivery';
import { parseRssItems } from '../../app/rss-checking/rss-parsing';
import { fetchRss } from '../../app/rss-checking/rss-response';
import { Account, isAccountNotFound } from '../../domain/account';
import { loadAccount } from '../../domain/account-storage';
import { HashedEmail } from '../../domain/email-address';
import { makeEmailAddressFromFeedId } from '../../domain/email-address-making';
import { Feed, ShowSampleEmailRequest } from '../../domain/feed';
import { FeedId, makeFeedId } from '../../domain/feed-id';
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

  const mostRecentPost = await getMostRecentPost(feed.url);

  if (isErr(mostRecentPost)) {
    logError(si`Failed to ${getMostRecentPost.name}: ${mostRecentPost.reason}`, {
      feedId: feedId.value,
      feedUrl: feed.url.toString(),
    });
    return makeAppError('Failed to send the sample email');
  }

  const result = await sendSampleEmail(env, account, feedId, feed, mostRecentPost);

  if (isErr(result)) {
    logError(si`Failed to ${sendSampleEmail.name}: ${result.reason}`);
    return makeAppError('Failed to send the sample email');
  }

  return makeSuccess(
    si`Please check ${account.email.value}.` +
      ' We’ve sent you a sample email with the most recent post from your blog feed.'
  );
};

async function getMostRecentPost(url: URL): Promise<Result<RssItem>> {
  const rssResponse = await fetchRss(url);

  if (isErr(rssResponse)) {
    return makeErr(si`Failed to ${fetchRss.name}: ${rssResponse.reason}`);
  }

  const rssParsingResult = await parseRssItems(rssResponse);

  if (isErr(rssParsingResult)) {
    return makeErr(si`Failed to ${parseRssItems.name}: ${rssParsingResult.reason}`);
  }

  const { validItems, invalidItems } = rssParsingResult;

  if (isEmpty(validItems) && isEmpty(invalidItems)) {
    return makeErr('No RSS items');
  }

  if (isEmpty(validItems) && !isEmpty(invalidItems)) {
    return makeErr('Only invalid RSS items');
  }

  const mostRecentPost = validItems[0]!; // ASSUMPTION: Ensured above that has items.

  return mostRecentPost;
}

async function sendSampleEmail(env: AppEnv, account: Account, feedId: FeedId, feed: Feed, mostRecentPost: RssItem) {
  const domainName = env.DOMAIN_NAME;
  const recipient = makeRecipientForSampleEmail(account);
  const fromAddress = makeEmailAddressFromFeedId(feedId, domainName);
  const from = makeFullEmailAddress(feed.displayName, fromAddress);

  const messageData = makeStoredEmailMessageData(feed, recipient, mostRecentPost, fromAddress, domainName);

  const emailContent: EmailContent = {
    subject: messageData.subject,
    htmlBody: messageData.htmlBody,
  };

  return await sendEmail(from, recipient.emailAddress, fromAddress, emailContent, env);
}

export function makeRecipientForSampleEmail(account: Account): HashedEmail {
  const recipient: HashedEmail = {
    kind: 'HashedEmail',
    emailAddress: account.email,
    isConfirmed: false,
    saltedHash: 'sample-salted-hash',
  };

  return recipient;
}

function makeShowSampleEmailReques(data: unknown) {
  return makeValues<ShowSampleEmailRequest>(data, {
    feedId: makeFeedId,
  });
}
