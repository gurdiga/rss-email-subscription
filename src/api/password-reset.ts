import { EmailContent, htmlBody } from '../app/email-sending/email-content';
import { sendEmail } from '../app/email-sending/email-delivery';
import { FullEmailAddress } from '../app/email-sending/emails';
import { AccountId, isAccountNotFound, makeAccountId } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, resetAccountPassword } from '../domain/account-storage';
import { AppSettings } from '../domain/app-settings';
import {
  accountControlSecretKinds,
  ConfirmationSecret,
  humanConfirmationSecretLifetime,
  isConfirmationSecretNotFound,
  isIssuedForAccount,
  makeConfirmationSecret,
  makeRandomConfirmationSecret,
  makeConfirmationLink,
} from '../domain/confirmation-secrets';
import {
  deleteConfirmationSecret,
  loadConfirmationSecretOfKind,
  revokeAccountSecrets,
  storeConfirmationSecret,
} from '../domain/confirmation-secrets-storage';
import { demoAccountEmail } from '../domain/demo-account';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { hashPassword } from '../domain/hashed-password';
import { makeNewPassword } from '../domain/new-password';
import { PagePath } from '../domain/page-path';
import {
  PasswordResetConfirmation,
  PasswordResetConfirmationSecret,
  PasswordResetConfirmationSecretData,
  PasswordResetRequest,
} from '../domain/password-reset';
import { AppStorage } from '../domain/storage';
import { AppError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { Result, isErr, makeErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { enablePrivateNavbarCookie, setDemoCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { AppEnv } from './init-app';
import { initSession } from './session';

export const requestPasswordReset: AppRequestHandler = async function forgotPassword(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { env, storage, settings }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: forgotPassword.name, reqId });
  const request = makePasswordResetRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makePasswordResetRequest.name}: ${request.reason}`);
    return makeInputError(request.reason, request.field);
  }

  const accountId = getAccountIdByEmail(request.email, settings.hashingSalt);
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}: ${account.reason}`);
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logError('Account not found', { accountId: accountId.value, email: request.email });
    return makeInputError<keyof PasswordResetRequest>('We don’t have an account registered with this email', 'email');
  }

  // Issuing a new reset link invalidates the account’s older ones, so that a link
  // the user has reason to distrust stops working once they request a replacement.
  // A failure here is logged rather than fatal: leaving a stale link alive is worse
  // than nothing, but refusing the reset outright would leave the user locked out.
  const revokeResult = revokeAccountSecrets(storage, accountId, ['PasswordResetConfirmationSecretData']);

  if (isErr(revokeResult)) {
    logWarning(si`Failed to ${revokeAccountSecrets.name}: ${revokeResult.reason}`, {
      accountId: accountId.value,
    });
  }

  const secret = makeRandomConfirmationSecret();
  const storeResult = storeForgotPasswordConfirmationSecret(storage, secret, accountId, account.creationTimestamp);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeForgotPasswordConfirmationSecret.name}: ${storeResult.reason}`);
    return makeAppError();
  }

  const sendResult = await sendConfirmationEmail(account.email, settings.fullEmailAddress, secret, env);

  if (isErr(sendResult)) {
    logError(si`Failed to ${sendConfirmationEmail.name}`, { reason: sendResult.reason, email: account.email.value });
    return makeAppError(sendResult.reason);
  }

  logInfo('User requested password change', { email: account.email.value, accountId: accountId.value });

  return makeSuccess('OK');
};

async function sendConfirmationEmail(
  recipient: EmailAddress,
  from: FullEmailAddress,
  secret: ConfirmationSecret,
  env: AppEnv
): Promise<Result<void | AppError>> {
  const replyTo = from.emailAddress;
  const emailContent = makeConfirmationEmailContent(secret, env.DOMAIN_NAME);
  const sendEmailResult = await sendEmail(from, recipient, replyTo, emailContent, env);

  if (isErr(sendEmailResult)) {
    return makeErr(si`Failed to ${sendEmail.name}: ${sendEmailResult.reason}`);
  }
}

function makeConfirmationEmailContent(secret: ConfirmationSecret, domainName: string): EmailContent {
  const confirmationLink = makeConfirmationLink(domainName, PagePath.confirmPasswordReset, secret);

  return {
    subject: 'Password reset link from FeedSubscription',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Here is the link to reset your password at FeedSubscription.com:</p>

      <b><a href="${confirmationLink.toString()}">Take me to the password reset form</a></b>

      <p>NOTE: This link ☝️ expires in ${humanConfirmationSecretLifetime}.</p>

      <p>If you did not ask to reset password, please ignore this message.</p>

      <p>Have a nice day.</p>
    `),
  };
}

function storeForgotPasswordConfirmationSecret(
  storage: AppStorage,
  secret: ConfirmationSecret,
  accountId: AccountId,
  accountCreatedAt: Date
): Result<void> {
  const secretData: PasswordResetConfirmationSecretData = {
    kind: 'PasswordResetConfirmationSecretData',
    accountId: accountId.value,
    accountCreatedAt,
  };
  const result = storeConfirmationSecret(storage, secret, secretData);

  if (isErr(result)) {
    return makeErr(si`Failed to ${storeConfirmationSecret.name}: ${result.reason}`);
  }
}

function makePasswordResetRequest(data: unknown): Result<PasswordResetRequest> {
  return makeValues<PasswordResetRequest>(data, {
    email: makeEmailAddress,
  });
}

export const confirmPasswordReset: AppRequestHandler = async function resetPassword(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { settings, storage, env },
  regenerateSession
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: resetPassword.name, reqId });
  const request = makePasswordResetConfirmation(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makePasswordResetConfirmation.name}: ${request.reason}`);
    return makeInputError(si`Invalid ${request.field!}: ${request.reason}`, request.field);
  }

  const secretData = loadConfirmationSecretOfKind(storage, request.secret, 'PasswordResetConfirmationSecretData');

  if (isErr(secretData)) {
    logError(si`Failed to ${loadConfirmationSecretOfKind.name}: ${secretData.reason}`);
    return makeAppError();
  }

  // A consumed or expired link is an ordinary thing for a user to hit — they bookmarked
  // it, or requested a newer one — so it gets a message they can act on rather than the
  // 500 that fell out of trying to parse the not-found marker as secret data.
  if (isConfirmationSecretNotFound(secretData)) {
    logWarning('Password reset secret not found', { secret: request.secret.value });
    return makeUnusableLinkError();
  }

  const forgotPasswordSecret = makeForgotPasswordSecret(secretData);

  if (isErr(forgotPasswordSecret)) {
    logError(si`Failed to ${makeForgotPasswordSecret.name}: ${forgotPasswordSecret.reason}`, { secretData });
    return makeAppError();
  }

  const { accountId } = forgotPasswordSecret;
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name} from password reset secret data: ${account.reason}`, {
      accountId: accountId.value,
    });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logError(si`Account not found for ${resetPassword.name}`, { accountId: accountId.value });
    return makeAppError();
  }

  if (!isIssuedForAccount(secretData, account)) {
    logWarning('Password reset secret issued for another account at this ID', { accountId: accountId.value });
    deleteConfirmationSecret(storage, request.secret);
    return makeUnusableLinkError();
  }

  // Consume the secret before hashing, which is where this handler yields to the event
  // loop. Deleting it afterwards would let two concurrent submissions of one link both
  // load it and both reset the password. A failure after this point costs the user their
  // link and they have to request a new one, which is the right side to err on for a
  // single-use token.
  const deleteResult = deleteConfirmationSecret(storage, request.secret);

  if (isErr(deleteResult)) {
    logError(si`Failed to ${deleteConfirmationSecret.name}: ${deleteResult.reason}`);
    return makeAppError();
  }

  const newHashedPassword = await hashPassword(request.newPassword.value);
  const isDemoAccount = account.email.value === demoAccountEmail;
  const resetResult = isDemoAccount ? undefined : resetAccountPassword(storage, accountId, newHashedPassword);

  if (isErr(resetResult)) {
    logError(si`Failed to ${resetAccountPassword.name}: ${resetResult.reason}`);
    return makeAppError();
  }

  // A pending email change or another reset link could hand the account to whoever
  // the owner is resetting away from. The reset itself has committed, so a failure
  // here is logged rather than reported.
  const revokeResult = isDemoAccount ? undefined : revokeAccountSecrets(storage, accountId, accountControlSecretKinds);

  if (isErr(revokeResult)) {
    logError(si`Failed to ${revokeAccountSecrets.name}: ${revokeResult.reason}`, { accountId: accountId.value });
  }

  const newReqSession = await regenerateSession();
  const sessionInitResult = initSession(storage, newReqSession, accountId, account.email);

  if (isErr(sessionInitResult)) {
    logError(si`Failed to ${initSession.name}: ${sessionInitResult.reason}`);
    return makeAppError();
  }

  sendPasswordResetConfirmationEmail(account.email, settings, env);

  const logData = {};
  const responseData = {};

  const maybeSetDemoCookie = isDemoAccount ? [setDemoCookie] : [];
  const cookies = [enablePrivateNavbarCookie, ...maybeSetDemoCookie];

  logInfo('User confirmed password change', { email: account.email.value, accountId: accountId.value });

  return makeSuccess('OK', logData, responseData, cookies);
};

function sendPasswordResetConfirmationEmail(accountEmail: EmailAddress, settings: AppSettings, env: AppEnv) {
  const emailContent = {
    subject: 'FeedSubscription password reset confirmation',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>At your request, your password at FeedSubscription.com has been reset.</p>

      <p>If you did not request a password reset, propmptly respond to this email
      and get in touch with us.</p>

      <p>Have a nice day.</p>
    `),
  };

  return sendEmail(settings.fullEmailAddress, accountEmail, settings.fullEmailAddress.emailAddress, emailContent, env);
}

// The kind was checked when the secret was loaded; makeValues only stamps it.
function makeForgotPasswordSecret(data: unknown): Result<PasswordResetConfirmationSecret> {
  return makeValues<PasswordResetConfirmationSecret>(data, {
    kind: 'PasswordResetConfirmationSecretData',
    accountId: makeAccountId,
  });
}

// The field must be set: the page’s error handling runs exhaustivenessCheck over it, so
// a field-less input error would throw there instead of displaying anything.
function makeUnusableLinkError() {
  return makeInputError<keyof PasswordResetConfirmation>(
    'This password reset link has expired or has already been used. Please request a new one.',
    'secret'
  );
}

function makePasswordResetConfirmation(data: unknown): Result<PasswordResetConfirmation> {
  return makeValues<PasswordResetConfirmation>(data, {
    secret: makeConfirmationSecret,
    newPassword: makeNewPassword,
  });
}
