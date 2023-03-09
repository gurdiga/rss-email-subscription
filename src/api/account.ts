import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import {
  AccountId,
  isAccountNotFound,
  makeEmailChangeConfirmationRequest,
  makeEmailChangeRequest,
  UiAccount,
} from '../domain/account';
import { loadAccount, setAccountEmail } from '../domain/account-storage';
import { AppSettings } from '../domain/app-settings';
import {
  ConfirmationSecret,
  isConfirmationSecretNotFound,
  makeConfirmationSecret,
} from '../domain/confirmation-secrets';
import {
  deleteConfirmationSecret,
  loadConfirmationSecret,
  storeConfirmationSecret,
} from '../domain/confirmation-secrets-storage';
import { EmailAddress } from '../domain/email-address';
import { PagePath } from '../domain/page-path';
import { AppStorage } from '../domain/storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { AppEnv } from './init-app';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const loadCurrentAccount: RequestHandler = async function loadCurrentAccount(
  reqId,
  _reqBody,
  _reqParams,
  reqSession,
  app
) {
  const { logWarning, logError } = makeCustomLoggers({ module: loadCurrentAccount.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const account = loadAccount(app.storage, accountId);

  if (isAccountNotFound(account)) {
    logWarning('Account not found', { accountId: accountId.value });
    return makeNotAuthenticatedError();
  }

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return makeAppError('Application error');
  }

  const logData = {};
  const responseData: UiAccount = {
    email: account.email.value,
  };

  return makeSuccess<UiAccount>('Success', logData, responseData);
};

export const confirmAccountEmailChange: RequestHandler = async function confirmAccountEmailChange(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: confirmAccountEmailChange.name, reqId });
  const request = makeEmailChangeConfirmationRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeEmailChangeConfirmationRequest.name}`, { reason: request.reason });
    return makeInputError('Invalid registration confirmation link');
  }

  const { secret } = request;
  const data = loadConfirmationSecret<EmailChangeRequestSecretData>(storage, secret);

  if (isErr(data)) {
    logError(si`Failed to ${loadConfirmationSecret.name}`, { reason: data.reason });
    return makeAppError('Application error');
  }

  if (isConfirmationSecretNotFound(data)) {
    logWarning('Confirmation secret not found', { confirmationSecret: secret.value });
    return makeInputError('Confirmation link expired or has already been confirmed');
  }

  const { accountId, newEmail } = data;
  const result = setAccountEmail(storage, accountId, newEmail);

  if (isErr(result)) {
    logError(si`Failed to ${setAccountEmail.name}`, { reason: result.reason });
    return makeAppError('Application error');
  }

  const deleteResult = deleteConfirmationSecret(storage, secret);

  if (isErr(deleteResult)) {
    logError(si`Failed to ${deleteConfirmationSecret.name}`, {
      reason: deleteResult.reason,
      secret: secret.value,
    });
    return makeAppError('Application error');
  }

  return makeSuccess('Confirmed email change');
};

export const requestAccountEmailChange: RequestHandler = async function requestAccountEmailChange(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: requestAccountEmailChange.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const request = makeEmailChangeRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeEmailChangeRequest.name}`, { reason: request.reason });
    return makeInputError(request.reason, request.field);
  }

  const { newEmail } = request;
  const confirmationSecret = makeEmailChangeConfirmationSecret(newEmail, settings.hashingSalt);

  if (isErr(confirmationSecret)) {
    logError(si`Failed to ${makeConfirmationSecret.name}`, {
      reason: confirmationSecret.reason,
      newEmail: newEmail.value,
    });
    return makeAppError('Application error');
  }

  const sendEmailResult = await sendConfirmationEmail(newEmail, confirmationSecret, settings, env);

  if (isErr(sendEmailResult)) {
    logError(si`Failed to ${sendConfirmationEmail.name}`, { reason: sendEmailResult.reason });
    return makeAppError('Application error');
  }

  const storeResult = storeEmailChangeRequestSecret(accountId, newEmail, confirmationSecret, storage);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeConfirmationSecret.name}`, { reason: storeResult.reason });
    return makeAppError('Application error');
  }

  return makeSuccess('Success');
};

async function sendConfirmationEmail(
  newEmail: EmailAddress,
  confirmationSecret: ConfirmationSecret,
  settings: AppSettings,
  env: AppEnv
) {
  const emailContent = makeEmailChangeConfirmationEmailContent(env.DOMAIN_NAME, confirmationSecret);
  const sendEmailResult = await sendEmail(
    settings.fullEmailAddress,
    newEmail,
    settings.fullEmailAddress.emailAddress,
    emailContent,
    env
  );
  return sendEmailResult;
}

function makeEmailChangeConfirmationSecret(newEmail: EmailAddress, hashingSalt: string): Result<ConfirmationSecret> {
  const secret = hash(newEmail.value, si`email-change-confirmation-secret-${hashingSalt}`);

  return makeConfirmationSecret(secret);
}

function storeEmailChangeRequestSecret(
  accountId: AccountId,
  newEmail: EmailAddress,
  confirmationSecret: ConfirmationSecret,
  storage: AppStorage
) {
  const timestamp = new Date();
  const confirmationSecretData: EmailChangeRequestSecretData = { accountId, newEmail, timestamp };
  return storeConfirmationSecret(storage, confirmationSecret, confirmationSecretData);
}

export function makeEmailChangeConfirmationEmailContent(
  domainName: string,
  confirmationSecret: ConfirmationSecret
): EmailContent {
  const confirmationLink = new URL(si`https://${domainName}${PagePath.emailChangeConfirmation}`);

  confirmationLink.searchParams.set('secret', confirmationSecret.value);

  return {
    subject: 'Please confirm FeedSubscription email change',
    htmlBody: si`
      <p>Hi there,</p>

      <p>Please confirm <b><font color="#0163ee">Feed</font>Subscription</b> email change by clicking the link below:</p>

      <p><a href="${confirmationLink.toString()}">Yes, I confirm email change</a>.</p>

      <p>If you did not initiate an account email change, please ignore this message.</p>

      <p>Have a nice day.</p>
    `,
  };
}

interface EmailChangeRequestSecretData {
  accountId: AccountId;
  newEmail: EmailAddress;
  timestamp: Date;
}
