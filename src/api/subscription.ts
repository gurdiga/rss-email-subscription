import { loadEmailAddresses, makeEmailHashFn, StoredEmailAddresses } from '../app/email-sending/emails';
import { makeEmailAddress } from '../domain/email-address-making';
import { makeHashedEmail, makeFullEmailAddress } from '../app/email-sending/emails';
import { EmailAddress, HashedEmail } from '../domain/email-address';
import { storeEmails, addEmail } from '../app/email-sending/emails';
import { EmailContent, htmlBody } from '../app/email-sending/email-content';
import { Feed } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { findFeedAccountId, loadFeed, isFeedNotFound } from '../domain/feed-storage';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { ConfirmationLinkUrlParams } from '../web-ui/shared';
import { AppError, InputError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { AppStorage } from '../domain/storage';
import { AppRequestHandler } from './app-request-handler';
import { si } from '../shared/string-utils';
import { AccountId, isAccountNotFound } from '../domain/account';
import { sendEmail } from '../app/email-sending/email-delivery';

export const subscription: AppRequestHandler = async function subscription(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage, env }
) {
  const { email } = reqBody;
  const { logWarning, logError, logInfo } = makeCustomLoggers({
    reqId,
    feedId: reqBody.feedId,
    source: reqBody.source,
    module: subscription.name,
  });

  const inputProcessingResult = processInput({ reqId, feedId: reqBody.feedId, email }, storage);

  if (inputProcessingResult.kind !== 'ProcessedInput') {
    return inputProcessingResult;
  }

  const { emailAddress, feed, feedId, accountId } = inputProcessingResult;
  const loadEmailsResult = loadEmailAddresses(accountId, feedId, storage);

  if (isErr(loadEmailsResult)) {
    logError(si`Failed to ${loadEmailAddresses.name}`, { reason: loadEmailsResult.reason });
    return makeAppError('Database read error');
  }

  if (loadEmailsResult.invalidEmails.length > 0) {
    logWarning('Found invalid emails stored', { invalidEmails: loadEmailsResult.invalidEmails });
  }

  if (doesEmailAlreadyExist(emailAddress, loadEmailsResult)) {
    logWarning('Already registered', { email: emailAddress.value });
    return makeSuccess('This email is already subscribed! 👍');
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
    return makeAppError();
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

  return makeSuccess('Thank you for subscribing. Please check your email to confirm.');
};

interface Input {
  reqId: string;
  email: string;
  feedId: string;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  emailAddress: EmailAddress;
  feed: Feed;
  feedId: FeedId;
  accountId: AccountId;
}

function processInput(input: Input, storage: AppStorage): ProcessedInput | InputError | AppError {
  const { reqId, email } = input;
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: processInput.name });
  const emailAddress = makeEmailAddress(email);

  if (isErr(emailAddress)) {
    logWarning('Invalid subscriber email', { email, feedId: input.feedId });
    return makeInputError('Invalid email');
  }

  const feedId = makeFeedId(input.feedId);

  if (isErr(feedId)) {
    logWarning('Invalid feedId', { reason: feedId.reason });
    return makeInputError('Invalid feed ID');
  }

  const accountId = findFeedAccountId(feedId, storage);

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
    accountId,
  };
}

function doesEmailAlreadyExist(emailAddress: EmailAddress, storedEmails: StoredEmailAddresses): boolean {
  const { validEmails } = storedEmails;
  const does = validEmails.some((x) => x.emailAddress.value === emailAddress.value);

  return does;
}

export function makeSubscriptionConfirmationEmailContent(
  feedDisplayName: string,
  confirmationLinkUrl: URL,
  listEmailAddress: EmailAddress
): EmailContent {
  return {
    subject: 'Please confirm subscription',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Please confirm subscription to <b>${feedDisplayName}</b> by clicking the link below:</p>

      <p><a href="${confirmationLinkUrl.toString()}">${confirmationLinkUrl.toString()}</a></p>

      <p style="max-width: 35em">
        If you subscribed, add this email address to your contacts
        so that it’s not considered spam:<br/>
        ${listEmailAddress.value}
      </p>

      <p>If you didn’t subscribe, please ignore this message.</p>

      <p>Have a nice day.</p>
    `),
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
