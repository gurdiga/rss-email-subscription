import { makeEmailContent, makeUnsubscribeUrl } from '../../app/email-sending/email-content';
import { makeItemEmailContentInWorker } from '../../app/email-sending/item-content-worker';
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

  // The demo password is public and a demo feed's replyTo is whatever its
  // creator typed, so a demo session gets the same fixed preview as an
  // anonymous visitor: the address may be a stranger's, the content isn't.
  if (isDemoSession(reqSession)) {
    const demoRecipient = makeRecipientForSampleEmail(feed.replyTo);
    const { result } = await sendFixedSampleEmail(demoRecipient, env);

    if (isErr(result)) {
      logError(si`Failed to ${sendFixedSampleEmail.name}: ${result.reason}`);
      return makeAppError('Failed to send the sample email');
    }

    return makeSuccess(
      si`Please check ${feed.replyTo.value}.` +
        ' We’ve sent you a sample email. Demo feeds get a fixed preview, not their latest post.'
    );
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
  const itemContent = await makeItemEmailContentInWorker(mostRecentPost, makeFullItemText(), emailSubjectSpec);

  if (isErr(itemContent)) {
    return itemContent;
  }

  const emailContent = makeEmailContent(itemContent, unsubscribeUrl, sender.emailAddress);

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
    return makeAppError('Failed to read the blog feed');
  }

  // The feed is fetched only to tell the visitor it works. Nothing from it
  // goes into the email: this endpoint needs no account and mails any
  // address it is given, so feed content here would let anyone send their
  // own HTML from our domain.
  const recipient = makeRecipientForSampleEmail(recipientEmail);
  const { result, sender, subject } = await sendFixedSampleEmail(recipient, env);

  if (isErr(result)) {
    logError(si`Failed to ${sendFixedSampleEmail.name}: ${result.reason}`);
    return makeAppError('Failed to send the sample email');
  }

  const logData = {};
  const responseData: PublicShowSampleEmailResponse = {
    emailSubject: subject,
    sender: si`${sender.displayName} <${sender.emailAddress.value}>`,
  };

  return makeSuccess('Email sent', logData, responseData);
};

async function sendFixedSampleEmail(recipient: HashedEmail, env: AppEnv) {
  const feedEmailAddress = makeEmailAddressFromFeedId(makeSampleFeedId(), env.DOMAIN_NAME);
  const sender = makeFullEmailAddress(publicSampleSenderName, feedEmailAddress);
  const unsubscribeUrl = makeUnsubscribeUrl(makeSampleFeedId(), recipient, publicSampleSenderName, env.DOMAIN_NAME);
  const placeholderPost = makePublicSamplePost(env.DOMAIN_NAME);
  const result = await sendSampleEmail(env, recipient, sender, placeholderPost, unsubscribeUrl, makeItemTitle());

  return { result, sender, subject: placeholderPost.title };
}

const publicSampleSenderName = 'FeedSubscription preview';

// The body is the opening of a real post on our blog, and the link
// points to that post: with a link to the site root, the footer’s
// “read this post online” suggested that subscribers get sent to the
// blog’s home page rather than to the post.
export function makePublicSamplePost(domainName: string): RssItem {
  const link = new URL(si`https://${domainName}/blog/hello-world.html`);

  return {
    title: 'Your post title goes here',
    content: si`
      <p><i>This is a sample of the email your subscribers will get when you publish a new post.
      The subject line is the post title, the sender name is your blog’s name, and the body is
      the full text of your post. Here, it’s the opening of a post from our own blog.</i></p>

      <img src="https://${domainName}/assets/blog/hello-world.webp" width="600"
        alt="A person walking down the middle of an empty road toward the mountains">

      <h2>Where it started</h2>
      <p>When Blogger’s FollowByEmail widget went away in 2021, I wanted to help my friend
      <a href="https://sandradodd.com/">Sandra Dodd</a>, who has a few blogs there.</p>
      <p>One service that seemed an OK option at the time was follow.it, but the ads on its free
      plan had nothing to do with the email content. And Sandra is a daily blogger, so we needed
      something that would send 1500 emails per day.</p>

      <h2>How hard can it be?</h2>
      <p>After looking around some more, I said to myself: <i>How hard can it be?!</i> In November
      2021, after a few months of nights and weekends, the system worked well enough to move
      Sandra’s blogs over to it.</p>

      <p><a href="${link.toString()}">Continue reading on the FeedSubscription blog →</a></p>`,
    author: publicSampleSenderName,
    pubDate: new Date(0),
    link,
    guid: 'public-sample-email',
  };
}

function makePublicShowSampleEmailReques(data: unknown) {
  return makeValues<PublicShowSampleEmailRequest>(data, {
    feedUrl: makeFeedUrl,
    recipientEmail: makeEmailAddress,
  });
}
