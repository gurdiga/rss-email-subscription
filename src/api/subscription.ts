import { EmailDeliveryEnv } from '../app/email-sending/email-delivery';
import { makeEmailAddress, loadStoredEmails, makeEmailHashFn, StoredEmails } from '../app/email-sending/emails';
import { EmailAddress, makeHashedEmail, HashedEmail, makeFullEmailAddress } from '../app/email-sending/emails';
import { storeEmails, addEmail } from '../app/email-sending/emails';
import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import { requireEnv } from '../shared/env';
import { Feed, FeedId, findAccountId, loadFeed, isFeedNotFound, makeFeedId } from '../domain/feed';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { ConfirmationLinkUrlParams } from '../web-ui/shared';
import { AppError, InputError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { AppStorage } from '../shared/storage';
import { RequestHandler } from './request-handler';
import { si } from '../shared/string-utils';
import { isAccountNotFound } from '../domain/account';

export const subscription: RequestHandler = async function subscription(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage }
) {
  const { email } = reqBody;
  const { logWarning, logError, logInfo } = makeCustomLoggers({
    reqId,
    feedId: reqBody.feedId,
    module: subscription.name,
  });
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    return makeAppError('Environment error');
  }

  const inputProcessingResult = processInput({ reqId, feedId: reqBody.feedId, email }, storage);

  if (inputProcessingResult.kind !== 'ProcessedInput') {
    return inputProcessingResult;
  }

  const { emailAddress, feed, feedId } = inputProcessingResult;
  const accountId = findAccountId(feedId, storage);

  if (isErr(accountId)) {
    logError(si`Failed to find feed account`, { reason: accountId.reason, feedId: feedId.value });
    return makeAppError('Feed not found');
  }

  if (isAccountNotFound(accountId)) {
    logError('Feed account not found', { feedId: feedId.value });
    return makeInputError('Feed not found');
  }

  const loadEmailsResult = loadStoredEmails(accountId, feedId, storage);

  if (isErr(loadEmailsResult)) {
    logError(si`Failed to ${loadStoredEmails.name}`, { reason: loadEmailsResult.reason });
    return makeAppError('Database read error');
  }

  if (loadEmailsResult.invalidEmails.length > 0) {
    logWarning('Found invalid emails stored', { invalidEmails: loadEmailsResult.invalidEmails });
  }

  if (doesEmailAlreadyExist(emailAddress, loadEmailsResult)) {
    logWarning('Already registered', { email: emailAddress.value });
    return makeInputError('Email is already subscribed');
  }

  const emailHashFn = makeEmailHashFn(feed.hashingSalt);
  const newEmails = addEmail(loadEmailsResult, emailAddress, emailHashFn);
  const result = storeEmails(newEmails.validEmails, accountId, feedId, storage);

  if (isErr(result)) {
    logError(si`Failed to ${storeEmails.name}`, { reason: result.reason });
    return makeAppError('Database write error');
  }

  const fromAddress = makeEmailAddress(si`${feed.id.value}@${env.DOMAIN_NAME}`);

  if (isErr(fromAddress)) {
    logError(si`Failed to ${makeEmailAddress.name}`, {
      feedId: feed.id.value,
      domainName: env.DOMAIN_NAME,
      reason: fromAddress.reason,
    });
    return makeAppError('Application error');
  }

  const { displayName, replyTo } = feed;

  const from = makeFullEmailAddress(displayName, fromAddress);
  const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);
  const confirmationLink = makeEmailConfirmationUrl(hashedEmail, feedId, displayName, env.DOMAIN_NAME);
  const emailContent = makeSubscriptionConfirmationEmailContent(displayName, confirmationLink, fromAddress);
  const sendingResult = await sendEmail(from, emailAddress, replyTo, emailContent, env);

  if (isErr(sendingResult)) {
    logError('Failed to send confirmation request email', { reason: sendingResult.reason });
    return makeAppError('Error sending confirmation request email');
  }

  logInfo('New unconfirmed subscriber', { email: emailAddress.value });

  return makeSuccess('Thank you for subscribing. Please check your email to confirm. 🤓');
};

interface Input {
  reqId: number;
  email: string;
  feedId: string;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  emailAddress: EmailAddress;
  feed: Feed;
  feedId: FeedId;
}

function processInput(input: Input, storage: AppStorage): ProcessedInput | InputError | AppError {
  const { reqId, email } = input;
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: processInput.name });
  const emailAddress = makeEmailAddress(email);

  if (isErr(emailAddress)) {
    logWarning('Invalid subscriber email', { email });
    return makeInputError('Invalid email');
  }

  const feedId = makeFeedId(input.feedId);

  if (isErr(feedId)) {
    logWarning('Invalid feedId', { reason: feedId.reason });
    return makeInputError('Invalid feed ID');
  }

  const accountId = findAccountId(feedId, storage);

  if (isErr(accountId)) {
    logError(si`Failed to find feed account`, { reason: accountId.reason, feedId: feedId.value });
    return makeAppError('Feed not found');
  }

  if (isAccountNotFound(accountId)) {
    logError('Feed account not found', { feedId: feedId.value });
    return makeInputError('Feed not found');
  }

  const feed = loadFeed(accountId, feedId, storage);

  if (isFeedNotFound(feed)) {
    logWarning('Feed not found', { feedId });
    return makeInputError('Feed not found');
  }

  if (isErr(feed)) {
    logError(si`Failed to ${loadFeed.name}`, { reason: feed.reason });
    return makeAppError('Failed to read feed settings');
  }

  return {
    kind: 'ProcessedInput',
    emailAddress,
    feed,
    feedId,
  };
}

function doesEmailAlreadyExist(emailAddress: EmailAddress, storedEmails: StoredEmails): boolean {
  const { validEmails } = storedEmails;
  const does = validEmails.some((x) => x.emailAddress.value === emailAddress.value);

  return does;
}

export function makeSubscriptionConfirmationEmailContent(
  feedDisplayName: string,
  confirmationLinkUrl: URL,
  listEmailAddress: EmailAddress
): EmailContent {
  const subject = 'Please confirm feed subscription';
  const htmlBody = si`
    <p>Hi there,</p>

    <p>Please confirm subscription to <b>${feedDisplayName}</b>:</p>

    <p><a href="${confirmationLinkUrl.toString()}">Yes, subscribe me</a></p>

    <p style="max-width: 35em">
      If you asked to be subscribed, add the list email to your contacts
      so that it’s not considered spam: ${listEmailAddress.value}. If you
      didn’t ask to subscribe, please ignore this message.
    </p>

    <p>Have a nice day.</p>
  `;

  return {
    subject,
    htmlBody,
  };
}

function makeUrlFromConfirmationLinkUrlParams(params: ConfirmationLinkUrlParams, domainName: string): URL {
  const url = new URL(si`https://${domainName}/subscription-confirmation.html`);
  let name: keyof typeof params;

  for (name in params) {
    url.searchParams.set(name, params[name]);
  }

  return url;
}

export function makeEmailConfirmationUrl(
  hashedEmail: HashedEmail,
  feedId: FeedId,
  feedDisplayName: string,
  domainName: string
): URL {
  const params: ConfirmationLinkUrlParams = {
    id: si`${feedId.value}-${hashedEmail.saltedHash}`,
    displayName: feedDisplayName || feedId.value,
    email: hashedEmail.emailAddress.value,
  };

  return makeUrlFromConfirmationLinkUrlParams(params, domainName);
}
