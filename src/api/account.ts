import { sendEmail } from '../app/email-sending/item-sending';
import {
  AccountId,
  EmailChangeConfirmationRequest,
  EmailChangeRequest,
  EmailChangeRequestData,
  isAccountNotFound,
  PasswordChangeRequest,
  PasswordChangeRequestData,
  UiAccount,
} from '../domain/account';
import { makeEmailChangeConfirmationSecretHash } from '../domain/account-crypto';
import { loadAccount, setAccountEmail, storeAccount } from '../domain/account-storage';
import { AppSettings } from '../domain/app-settings';
import {
  ConfirmationSecret,
  EmailChangeRequestSecretData,
  isConfirmationSecretNotFound,
  makeConfirmationSecret,
  makeEmailChangeRequestSecretData,
} from '../domain/confirmation-secrets';
import {
  deleteConfirmationSecret,
  loadConfirmationSecret,
  storeConfirmationSecret,
} from '../domain/confirmation-secrets-storage';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { makeHashedPassword } from '../domain/hashed-password';
import { PagePath } from '../domain/page-path';
import { makePassword } from '../domain/password';
import { AppStorage } from '../domain/storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr, makeValues, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { AppEnv } from './init-app';
import { AppRequestHandler } from './request-handler';
import { checkSession, deinitSession, isAuthenticatedSession } from './session';

// TODO: Add api-test
export const loadCurrentAccount: AppRequestHandler = async function loadCurrentAccount(
  reqId,
  _reqBody,
  _reqParams,
  reqSession,
  app
) {
  const { logWarning, logError } = makeCustomLoggers({ module: loadCurrentAccount.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
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
    return makeAppError();
  }

  const logData = {};
  const responseData: UiAccount = {
    email: account.email.value,
  };

  return makeSuccess<UiAccount>('Success', logData, responseData);
};

export const confirmAccountEmailChange: AppRequestHandler = async function confirmAccountEmailChange(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
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
    return makeAppError();
  }

  if (isConfirmationSecretNotFound(data)) {
    logWarning('Confirmation secret not found', { confirmationSecret: secret.value });
    return makeInputError('Confirmation has already been confirmed');
  }

  const { accountId, newEmail } = data;
  const oldEmail = setAccountEmail(storage, accountId, newEmail, settings.hashingSalt);

  if (isErr(oldEmail)) {
    logError(si`Failed to ${setAccountEmail.name}`, { reason: oldEmail.reason });
    return makeAppError();
  }

  if (isAccountNotFound(oldEmail)) {
    logError(si`Account to set email not found`, { accountId: accountId.value });
    return makeAppError();
  }

  const deleteResult = deleteConfirmationSecret(storage, secret);

  if (isErr(deleteResult)) {
    logError(si`Failed to ${deleteConfirmationSecret.name}`, {
      reason: deleteResult.reason,
      secret: secret.value,
    });
    return makeAppError();
  }

  deinitSession(reqSession);
  sendEmailChangeInformationEmail(oldEmail, settings, env, newEmail);

  const logData = {
    newEmail: newEmail.value,
    accountId: accountId.value,
  };

  return makeSuccess('Confirmed email change', logData);
};

export function makeEmailChangeConfirmationRequest(data: unknown): Result<EmailChangeConfirmationRequest> {
  return makeValues<EmailChangeConfirmationRequest>(data, {
    secret: makeConfirmationSecret,
  });
}

async function sendEmailChangeInformationEmail(
  oldEmail: EmailAddress,
  settings: AppSettings,
  env: AppEnv,
  newEmail: EmailAddress
) {
  const emailContent = {
    subject: 'Please note FeedSubscription email change',
    htmlBody: si`
      <p>Hi there,</p>

      <p>Please note that the account email at <b><font color="#0163ee">Feed</font>Subscription</b>
      has been changed from <b>${oldEmail.value}</b> to <b>${newEmail.value}</b>.</p>

      <p>Have a nice day.</p>
    `,
  };

  return await sendEmail(
    settings.fullEmailAddress,
    oldEmail,
    settings.fullEmailAddress.emailAddress,
    emailContent,
    env
  );
}

export const requestAccountPasswordChange: AppRequestHandler = async function requestAccountPasswordChange(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: requestAccountPasswordChange.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const request = makePasswordChangeRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makePasswordChangeRequest.name}`, { reason: request.reason, reqBody });
    return makeInputError(request.reason, request.field);
  }

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason, accountId: accountId.value });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logError(si`Account not found`, { accountId: accountId.value });
    return makeAppError();
  }

  const currentHashedPassword = hash(request.currentPassword.value, settings.hashingSalt);

  if (currentHashedPassword !== account.hashedPassword.value) {
    return makeInputError<keyof PasswordChangeRequest>(si`Current password doesn’t match`, 'currentPassword');
  }

  if (request.currentPassword.value === request.newPassword.value) {
    return makeInputError<keyof PasswordChangeRequest>(
      si`New password can’t be the same as the old one`,
      'newPassword'
    );
  }

  const newHashedPassword = makeHashedPassword(hash(request.newPassword.value, settings.hashingSalt));

  if (isErr(newHashedPassword)) {
    logError(si`Failed to ${makeHashedPassword.name}`, { reason: newHashedPassword.reason });
    return makeAppError();
  }

  account.hashedPassword = newHashedPassword;
  storeAccount(storage, accountId, account);
  sendPasswordChangeInformationEmail(account.email, settings, env);

  return makeSuccess();
};

async function sendPasswordChangeInformationEmail(email: EmailAddress, settings: AppSettings, env: AppEnv) {
  const emailContent = {
    subject: 'Please note FeedSubscription passsword change',
    htmlBody: si`
      <p>Hi there,</p>

      <p>Please note that the account password at <b><font color="#0163ee">Feed</font>Subscription</b>
      has been changed.</p>

      <p>Have a nice day.</p>
    `,
  };

  return await sendEmail(settings.fullEmailAddress, email, settings.fullEmailAddress.emailAddress, emailContent, env);
}

function makePasswordChangeRequest(data: unknown | PasswordChangeRequestData): Result<PasswordChangeRequest> {
  return makeValues<PasswordChangeRequest>(data, { currentPassword: makePassword, newPassword: makePassword });
}

export const requestAccountEmailChange: AppRequestHandler = async function requestAccountEmailChange(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: requestAccountEmailChange.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId, email } = session;
  const request = makeEmailChangeRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeEmailChangeRequest.name}`, { reason: request.reason });
    return makeInputError(request.reason, request.field);
  }

  const { newEmail } = request;

  if (newEmail.value === email.value) {
    return makeInputError<keyof EmailChangeRequestData>('Email did not change', 'newEmail');
  }

  const confirmationSecret = makeEmailChangeConfirmationSecret(newEmail, settings.hashingSalt);

  if (isErr(confirmationSecret)) {
    logError(si`Failed to ${makeConfirmationSecret.name}`, {
      reason: confirmationSecret.reason,
      newEmail: newEmail.value,
    });
    return makeAppError();
  }

  const sendEmailResult = await sendEmailChangeConfirmationEmail(newEmail, confirmationSecret, settings, env);

  if (isErr(sendEmailResult)) {
    logError(si`Failed to ${sendEmailChangeConfirmationEmail.name}`, { reason: sendEmailResult.reason });
    return makeAppError();
  }

  const storeResult = storeEmailChangeRequestSecret(accountId, newEmail, confirmationSecret, storage);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeConfirmationSecret.name}`, { reason: storeResult.reason });
    return makeAppError();
  }

  return makeSuccess('Success');
};

function makeEmailChangeRequest(data: unknown): Result<EmailChangeRequest> {
  return makeValues<EmailChangeRequest>(data, { newEmail: makeEmailAddress });
}

async function sendEmailChangeConfirmationEmail(
  newEmail: EmailAddress,
  confirmationSecret: ConfirmationSecret,
  settings: AppSettings,
  env: AppEnv
) {
  const confirmationLink = new URL(si`https://${env.DOMAIN_NAME}${PagePath.emailChangeConfirmation}`);

  confirmationLink.searchParams.set('secret', confirmationSecret.value);

  const emailContent = {
    subject: 'Please confirm FeedSubscription email change',
    htmlBody: si`
      <p>Hi there,</p>

      <p>Please confirm <b><font color="#0163ee">Feed</font>Subscription</b> email change by clicking the link below:</p>

      <p><a href="${confirmationLink.toString()}">Yes, I confirm email change</a>.</p>

      <p>If you did not initiate an account email change, please ignore this message.</p>

      <p>Have a nice day.</p>
    `,
  };

  return await sendEmail(
    settings.fullEmailAddress,
    newEmail,
    settings.fullEmailAddress.emailAddress,
    emailContent,
    env
  );
}

function makeEmailChangeConfirmationSecret(newEmail: EmailAddress, hashingSalt: string): Result<ConfirmationSecret> {
  const secret = makeEmailChangeConfirmationSecretHash(newEmail, hashingSalt);

  return makeConfirmationSecret(secret);
}

function storeEmailChangeRequestSecret(
  accountId: AccountId,
  newEmail: EmailAddress,
  confirmationSecret: ConfirmationSecret,
  storage: AppStorage
) {
  const confirmationSecretData = makeEmailChangeRequestSecretData(accountId, newEmail);

  return storeConfirmationSecret(storage, confirmationSecret, confirmationSecretData);
}
