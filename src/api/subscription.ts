import { EmailDeliveryEnv } from '../app/email-sending/email-delivery';
import { makeEmailAddress, loadStoredEmails, makeEmailHashFn, StoredEmails } from '../app/email-sending/emails';
import { EmailAddress, makeHashedEmail, HashedEmail, makeFullEmailAddress } from '../app/email-sending/emails';
import { storeEmails, addEmail } from '../app/email-sending/emails';
import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import { requireEnv } from '../shared/env';
import { FeedSettings, getFeedSettings, isFeedNotFound } from '../domain/feed-settings';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { ConfirmationLinkUrlParams } from '../web-ui/shared';
import { AppError, InputError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { AppStorage } from '../shared/storage';
import { AppRequestHandler } from './request-handler';

export const subscription: AppRequestHandler = async function subscription(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage }
) {
  const { feedId, email } = reqBody;
  const { logWarning, logError, logInfo } = makeCustomLoggers({ reqId, feedId, module: subscription.name });
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError(`Invalid environment`, { reason: env.reason });
    return makeAppError('Environment error');
  }

  const inputProcessingResult = processInput({ reqId, feedId, email }, storage, env.DOMAIN_NAME);

  if (inputProcessingResult.kind !== 'ProcessedInput') {
    return inputProcessingResult;
  }

  const { emailAddress, feedSettings } = inputProcessingResult;

  const storedEmails = loadStoredEmails(feedId, storage);

  if (isErr(storedEmails)) {
    logError(`Failed to ${loadStoredEmails.name}`, { reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  if (isFeedNotFound(storedEmails)) {
    logError('Feed not found', { feedId });
    return makeInputError('Feed not found');
  }

  if (storedEmails.invalidEmails.length > 0) {
    logWarning('Found invalid emails stored', { invalidEmails: storedEmails.invalidEmails });
  }

  if (doesEmailAlreadyExist(emailAddress, storedEmails)) {
    logWarning('Already registered', { email: emailAddress.value });
    return makeInputError('Email is already subscribed');
  }

  const emailHashFn = makeEmailHashFn(feedSettings.hashingSalt);
  const newEmails = addEmail(storedEmails, emailAddress, emailHashFn);
  const result = storeEmails(newEmails.validEmails, feedId, storage);

  if (isErr(result)) {
    logError(`Failed to ${storeEmails.name}`, { reason: result.reason });
    return makeAppError('Database write error');
  }

  const { displayName, fromAddress, replyTo } = feedSettings;

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
  feedSettings: FeedSettings;
}

function processInput(
  { reqId, email, feedId }: Input,
  storage: AppStorage,
  domainName: string
): ProcessedInput | InputError | AppError {
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: processInput.name });
  const emailAddress = makeEmailAddress(email);

  if (isErr(emailAddress)) {
    logWarning('Invalid subscriber email', { email });
    return makeInputError('Invalid email');
  }

  const feedSettings = getFeedSettings(feedId, storage, domainName);

  if (feedSettings.kind === 'FeedNotFound') {
    logWarning('Feed not found', { feedId });
    return makeInputError('Feed not found');
  }

  if (isErr(feedSettings)) {
    logError(`Failed to ${getFeedSettings.name}`, { reason: feedSettings.reason });
    return makeAppError('Failed to read feed settings');
  }

  return {
    kind: 'ProcessedInput',
    emailAddress,
    feedSettings,
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
  const htmlBody = `
    <p>Hi there,</p>

    <p>Please confirm subscription to <b>${feedDisplayName}</b>:</p>

    <p><a href="${confirmationLinkUrl}">Yes, subscribe me</a></p>

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
  const url = new URL(`https://${domainName}/subscription-confirmation.html`);
  let name: keyof typeof params;

  for (name in params) {
    url.searchParams.set(name, params[name]);
  }

  return url;
}

export function makeEmailConfirmationUrl(
  hashedEmail: HashedEmail,
  feedId: string,
  feedDisplayName: string,
  domainName: string
): URL {
  const params: ConfirmationLinkUrlParams = {
    id: `${feedId}-${hashedEmail.saltedHash}`,
    displayName: feedDisplayName || feedId,
    email: hashedEmail.emailAddress.value,
  };

  return makeUrlFromConfirmationLinkUrlParams(params, domainName);
}
