import path from 'path';
import {
  makeEmailAddress,
  loadStoredEmails,
  makeEmailHashFn,
  StoredEmails,
  EmailAddress,
  EmailHashFn,
  makeHashedEmail,
  HashedEmail,
  makeEmailInformation,
  EmailIndex,
} from '../email-sending/emails';
import { EmailContent } from '../email-sending/item-sending';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { DOMAIN_NAME, FeedSettings, getFeedSettings } from '../shared/feed-settings';
import { writeFile, WriteFileFn } from '../shared/io';
import { Result, isErr, makeErr, getErrorMessage } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppError, AppRequestHandler, InputError, makeAppError, makeInputError } from './shared';

export const subscribe: AppRequestHandler = function subscribe(reqId, reqBody, _reqParams, dataDirRoot) {
  const { feedId, email } = reqBody;
  const inputProcessingResult = processInput({ reqId, feedId, email, dataDirRoot });

  if (inputProcessingResult.kind !== 'ProcessedInput') {
    return inputProcessingResult;
  }

  const { logWarning, logError } = makeCustomLoggers({ reqId, feedId, module: subscribe.name });
  const { emailAddress, dataDir, feedSettings } = inputProcessingResult;

  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { reason: storedEmails.reason });
    return makeAppError('Databse read error');
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
  const result = storeEmails(newEmails.validEmails, dataDir);

  if (isErr(result)) {
    logError('Can’t store emails', { reason: result.reason });
    return makeAppError('Databse write error');
  }

  return {
    kind: 'Success',
    message: 'You are subscribed now. Welcome aboard! 🙂',
  };
};

interface Input {
  reqId: number;
  email: string;
  feedId: string;
  dataDirRoot: string;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  emailAddress: EmailAddress;
  dataDir: DataDir;
  feedSettings: FeedSettings;
}

function processInput({ reqId, email, feedId, dataDirRoot }: Input): ProcessedInput | InputError | AppError {
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: processInput.name });
  const emailAddress = makeEmailAddress(email);

  if (isErr(emailAddress)) {
    logWarning('Invalid email', { emailAddress });
    return makeInputError('Invalid email');
  }

  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    logWarning('Invalid dataDir', { feedId });
    return makeInputError('Invalid feed id');
  }

  const feedSettings = getFeedSettings(dataDir);

  if (feedSettings.kind === 'FeedNotFound') {
    logWarning('Feed not found');
    return makeInputError('Feed not found');
  }

  if (isErr(feedSettings)) {
    logError('Can’t read feed settings', { reason: feedSettings.reason });
    return makeAppError('Can’t read feed settings');
  }

  return {
    kind: 'ProcessedInput',
    emailAddress,
    dataDir,
    feedSettings,
  };
}

export function storeEmails(
  hashedEmails: HashedEmail[],
  dataDir: DataDir,
  writeFileFn: WriteFileFn = writeFile
): Result<void> {
  const emailIndex: EmailIndex = {};

  hashedEmails.forEach((e) => {
    emailIndex[e.saltedHash] = makeEmailInformation(e.emailAddress, e.isConfirmed);
  });

  const fileContents = JSON.stringify(emailIndex);
  const filePath = path.join(dataDir.value, 'emails.json');

  try {
    writeFileFn(filePath, fileContents);
  } catch (error) {
    return makeErr(`Could not store emails: ${getErrorMessage(error)}`);
  }
}

export function addEmail(
  storedEmails: StoredEmails,
  emailAddress: EmailAddress,
  emailHashFn: EmailHashFn
): StoredEmails {
  const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);

  storedEmails.validEmails.push(hashedEmail);

  return storedEmails;
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

export function makeEmailConfirmationUrl(hashedEmail: HashedEmail, feedId: string, feedDisplayName: string): URL {
  const url = new URL(`https://${DOMAIN_NAME}/confirm.html`);

  url.searchParams.set('id', `${feedId}-${hashedEmail.saltedHash}`);
  url.searchParams.set('displayName', feedDisplayName || feedId);
  url.searchParams.set('email', hashedEmail.emailAddress.value);

  return url;
}
