import { makeEmailContent, makeUnsubscribeUrl } from '../../app/email-sending/email-content';
import { sendEmail } from '../../app/email-sending/email-delivery';
import { FullEmailAddress, makeFullEmailAddress } from '../../app/email-sending/emails';
import { getFeedInfo } from '../../app/rss-checking/rss-parsing';
import { isAccountNotFound } from '../../domain/account';
import { loadAccount } from '../../domain/account-storage';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { makeEmailAddress, makeEmailAddressFromFeedId } from '../../domain/email-address-making';
import {
  FeedEmailSubjectSpec,
  PublicShowSampleEmailRequest,
  PublicShowSampleEmailResponse,
  ShowSampleEmailRequest,
  makeFeedUrl,
  makeFullItemText,
  makeItemTitle,
} from '../../domain/feed';
import { makeFeedId, makeSampleFeedId } from '../../domain/feed-id';
import { isFeedNotFound, loadFeed } from '../../domain/feed-storage';
import { RssItem } from '../../domain/rss-item';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../../shared/api-response';
import { isErr, makeValues } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { AppRequestHandler } from '../app-request-handler';
import { AppEnv } from '../init-app';
import { checkSession, isAuthenticatedSession, isDemoSession } from '../session';

export const showSampleEmail: AppRequestHandler = async function showSampleEmail(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { env, storage }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: showSampleEmail.name, reqId });
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
  const recipient = makeRecipientForSampleEmail(isDemoSession(reqSession) ? feed.replyTo : account.email);
  const unsubscribeUrl = makeUnsubscribeUrl(feed.id, recipient, feed.displayName, env.DOMAIN_NAME);

  const result = await sendSampleEmail(
    env,
    recipient,
    sender,
    feedInfo.mostRecentItem,
    unsubscribeUrl,
    feed.emailSubjectSpec
  );

  logInfo('sendSampleEmail', {
    recipient: recipient.emailAddress.value,
    sender: sender.emailAddress.value,
    feedInfo: feedInfo,
  });

  if (isErr(result)) {
    logError(si`Failed to ${sendSampleEmail.name}: ${result.reason}`);
    return makeAppError('Failed to send the sample email');
  }

  return makeSuccess(
    si`Please check ${recipient.emailAddress.value}.` +
      ' We’ve sent you a sample email with the most recent post from this blog feed.'
  );
};

async function sendSampleEmail(
  env: AppEnv,
  recipient: HashedEmail,
  sender: FullEmailAddress,
  mostRecentPost: RssItem,
  unsubscribeUrl: URL,
  emailSubjectSpec: FeedEmailSubjectSpec
) {
  const emailBodySpec = makeFullItemText();
  const emailContent = makeEmailContent(
    mostRecentPost,
    unsubscribeUrl,
    sender.emailAddress,
    emailBodySpec,
    emailSubjectSpec
  );

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
  const emailSubjectSpec = makeItemTitle();

  const result = await sendSampleEmail(
    env,
    recipient,
    sender,
    feedInfo.mostRecentItem,
    unsubscribeUrl,
    emailSubjectSpec
  );

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
