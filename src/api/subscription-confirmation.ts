import { EmailContent, htmlBody } from '../app/email-sending/email-content';
import { sendEmail } from '../app/email-sending/email-delivery';
import { loadEmailAddresses, storeEmails } from '../app/email-sending/emails';
import { AccountId, isAccountNotFound } from '../domain/account';
import { loadAccount } from '../domain/account-storage';
import { demoAccountEmail } from '../domain/demo-account';
import { EmailAddress } from '../domain/email-address';
import { FeedId } from '../domain/feed-id';
import { findFeedAccountId, isFeedNotFound, loadFeed } from '../domain/feed-storage';
import { FeedManageParams, ManageFeedSubscribersParams, PagePath, makePagePathWithParams } from '../domain/page-path';
import { SubscriptionConfirmationRequest, makeSubscriptionId } from '../domain/subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { AppRequestHandler } from './app-request-handler';
import { App } from './init-app';

export const subscriptionConfirmation: AppRequestHandler = async function subscriptionConfirmation(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  app
) {
  const { storage } = app;
  const { logInfo, logWarning, logError } = makeCustomLoggers({ reqId, module: subscriptionConfirmation.name });
  const request = makeSubscriptionConfirmationRequest(reqBody);

  if (isErr(request)) {
    logWarning('Invalid subscription ID', { reason: request.reason, reqBody });
    return makeInputError(request.reason, request.field);
  }

  const { emailHash, feedId } = request.id;
  const accountId = findFeedAccountId(feedId, storage);

  if (isErr(accountId)) {
    logError(si`Failed to find feed account`, { reason: accountId.reason, feedId: feedId.value });
    return makeAppError('Feed not found');
  }

  if (isAccountNotFound(accountId)) {
    logError(si`Feed account not found on ${subscriptionConfirmation.name}`, { feedId: feedId.value });
    return makeInputError('Feed not found');
  }

  const storedEmails = loadEmailAddresses(accountId, feedId, storage);

  if (isErr(storedEmails)) {
    logError(si`Failed to ${loadEmailAddresses.name}`, { feedId, reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  const { validEmails } = storedEmails;
  const registeredEmail = validEmails.find((x) => x.saltedHash === emailHash);

  if (!registeredEmail) {
    logWarning('Email not registered yet', { emailHash });
    return makeInputError(
      'Email is not registered for confirmation. Maybe the confirmation link is expired? 🤔 Please try registering again.'
    );
  }

  const wasAlreadyConfirmed = registeredEmail.isConfirmed;

  registeredEmail.isConfirmed = true;

  const storeResult = storeEmails(storedEmails.validEmails, accountId, feedId, storage);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeEmails.name}`, { reason: storeResult.reason });
    return makeAppError('Database write error: registering confirmation failed');
  }

  logInfo('Subscriber confirmed email', { feedId: feedId.value, email: registeredEmail.emailAddress.value });

  // A repeat click, or a mail client’s link scanner, must not notify the owner again.
  if (!wasAlreadyConfirmed) {
    await notifyFeedOwner(accountId, feedId, registeredEmail.emailAddress, app, reqId);
  }

  return makeSuccess('Email confirmed. Welcome aboard! 😎');
};

// Failures are logged rather than returned: the subscriber’s confirmation has already succeeded.
export async function notifyFeedOwner(
  accountId: AccountId,
  feedId: FeedId,
  subscriber: EmailAddress,
  { storage, settings, env }: App,
  reqId: string,
  sendEmailFn = sendEmail
): Promise<void> {
  const { logInfo, logError } = makeCustomLoggers({ reqId, module: notifyFeedOwner.name, feedId: feedId.value });
  const feed = loadFeed(accountId, feedId, storage);

  if (isErr(feed)) {
    logError(si`Failed to ${loadFeed.name}`, { reason: feed.reason });
    return;
  }

  if (isFeedNotFound(feed)) {
    logError('Feed not found', { accountId: accountId.value });
    return;
  }

  if (!feed.notifyOnSubscribe) {
    return;
  }

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return;
  }

  if (isAccountNotFound(account)) {
    logError('Account not found', { accountId: accountId.value });
    return;
  }

  // The demo account’s address is ours, so anyone signed into the demo could have us mail it.
  if (account.email.value === demoAccountEmail) {
    logInfo('Skipped notifying the demo account');
    return;
  }

  const manageSubscribersUrl = makeManageSubscribersUrl(feedId, env.DOMAIN_NAME);
  const feedManageUrl = makeFeedManageUrl(feedId, env.DOMAIN_NAME);
  const emailContent = makeNewSubscriberEmailContent(feed.displayName, subscriber, manageSubscribersUrl, feedManageUrl);
  const { fullEmailAddress } = settings;
  const result = await sendEmailFn(fullEmailAddress, account.email, fullEmailAddress.emailAddress, emailContent, env);

  if (isErr(result)) {
    logError(si`Failed to ${sendEmail.name}`, { reason: result.reason });
    return;
  }

  logInfo('Notified feed owner of new subscriber', { email: subscriber.value });
}

export function makeNewSubscriberEmailContent(
  feedDisplayName: string,
  subscriber: EmailAddress,
  manageSubscribersUrl: URL,
  feedManageUrl: URL
): EmailContent {
  return {
    subject: si`New subscriber to ${feedDisplayName}`,
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>${subscriber.value} has just subscribed to <b>${feedDisplayName}</b>.</p>

      <p>You can see all your subscribers at
      <a href="${manageSubscribersUrl.toString()}">${manageSubscribersUrl.toString()}</a>.</p>

      <p>You can turn these notifications off in the <a href="${feedManageUrl.toString()}">feed settings</a>.</p>

      <p>Have a nice day.</p>
    `),
  };
}

function makeManageSubscribersUrl(feedId: FeedId, domainName: string): URL {
  const path = makePagePathWithParams<ManageFeedSubscribersParams>(PagePath.manageFeedSubscribers, {
    id: feedId.value,
  });

  return new URL(path, si`https://${domainName}`);
}

function makeFeedManageUrl(feedId: FeedId, domainName: string): URL {
  const path = makePagePathWithParams<FeedManageParams>(PagePath.feedManage, {
    id: feedId.value,
    idChanged: 'false',
  });

  return new URL(path, si`https://${domainName}`);
}

function makeSubscriptionConfirmationRequest(data: unknown) {
  return makeValues<SubscriptionConfirmationRequest>(data, {
    id: makeSubscriptionId,
  });
}
