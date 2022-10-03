import { EmailDeliveryEnv } from '../app/email-sending/email-delivery';
import {
  makeEmailAddress,
  loadStoredEmails,
  makeEmailHashFn,
  StoredEmails,
  EmailAddress,
  makeHashedEmail,
  HashedEmail,
  makeFullEmailAddress,
  storeEmails,
  addEmail,
} from '../app/email-sending/emails';
import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import { requireEnv } from '../shared/env';
import { DOMAIN_NAME, FeedSettings, getFeedSettings, isFeedNotFound } from '../domain/feed-settings';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { ConfirmationLinkUrlParams } from '../web-ui/utils';
import { AppError, InputError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { AppStorage } from '../shared/storage';
import { AppRequestHandler } from './request-handler';

export const subscribe: AppRequestHandler = async function subscribe(reqId, reqBody, _reqParams, { storage }) {
  const { feedId, email } = reqBody;
  const inputProcessingResult = processInput({ reqId, feedId, email }, storage);

  if (inputProcessingResult.kind !== 'ProcessedInput') {
    return inputProcessingResult;
  }

  const { logWarning, logError } = makeCustomLoggers({ reqId, feedId, module: subscribe.name });
  const { emailAddress, feedSettings } = inputProcessingResult;
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError(`Invalid environment`, { reason: env.reason });
    return makeAppError('Environment error');
  }

  const storedEmails = loadStoredEmails(feedId, storage);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  if (isFeedNotFound(storedEmails)) {
    logError('Feed not found', { feedId });
    return makeInputError('Feed not found');
  }

  if (storedEmails.invalidEmails.length > 0) {
    logWarning('Found invalid emails stored', { invalidEmails: storedEmails.invalidEmails });
  }

  if (emailAlreadyExists(emailAddress, storedEmails)) {
    logWarning('Already registered', { email: emailAddress.value });
    return makeInputError('Email is already subscribed');
  }

  const emailHashFn = makeEmailHashFn(feedSettings.hashingSalt);
  const newEmails = addEmail(storedEmails, emailAddress, emailHashFn);
  const result = storeEmails(newEmails.validEmails, feedId, storage);

  if (isErr(result)) {
    logError('Can’t store emails', { reason: result.reason });
    return makeAppError('Database write error');
  }

  const { displayName, fromAddress, replyTo } = feedSettings;

  const from = makeFullEmailAddress(displayName, fromAddress);
  const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);
  const confirmationLink = makeEmailConfirmationUrl(hashedEmail, feedId, displayName);
  const emailContent = makeConfirmationEmailContent(displayName, confirmationLink, fromAddress);
  const sendingResult = await sendEmail(from, emailAddress, replyTo, emailContent, env);

  if (isErr(sendingResult)) {
    logError('Can’t send confirmation request email', { reason: sendingResult.reason });
    return makeAppError('Error sending confirmation request email');
  }

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

function processInput({ reqId, email, feedId }: Input, storage: AppStorage): ProcessedInput | InputError | AppError {
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: processInput.name });
  const emailAddress = makeEmailAddress(email);

  if (isErr(emailAddress)) {
    logWarning('Invalid email', { emailAddress });
    return makeInputError('Invalid email');
  }

  const feedSettings = getFeedSettings(feedId, storage);

  if (feedSettings.kind === 'FeedNotFound') {
    logWarning('Feed not found', { feedId });
    return makeInputError('Feed not found');
  }

  if (isErr(feedSettings)) {
    logError('Can’t read feed settings', { reason: feedSettings.reason });
    return makeAppError('Can’t read feed settings');
  }

  return {
    kind: 'ProcessedInput',
    emailAddress,
    feedSettings,
  };
}

function emailAlreadyExists(emailAddress: EmailAddress, storedEmails: StoredEmails): boolean {
  const { validEmails } = storedEmails;
  const alreadyExists = validEmails.some((x) => x.emailAddress.value === emailAddress.value);

  return alreadyExists;
}

export function makeConfirmationEmailContent(
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

function makeUrlFromConfirmationLinkUrlParams(params: ConfirmationLinkUrlParams): URL {
  const url = new URL(`https://${DOMAIN_NAME}/confirm-subscription.html`);
  let name: keyof typeof params;

  for (name in params) {
    url.searchParams.set(name, params[name]);
  }

  return url;
}

export function makeEmailConfirmationUrl(hashedEmail: HashedEmail, feedId: string, feedDisplayName: string): URL {
  const params: ConfirmationLinkUrlParams = {
    id: `${feedId}-${hashedEmail.saltedHash}`,
    displayName: feedDisplayName || feedId,
    email: hashedEmail.emailAddress.value,
  };

  return makeUrlFromConfirmationLinkUrlParams(params);
}
