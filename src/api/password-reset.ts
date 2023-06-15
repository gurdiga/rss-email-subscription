import { EmailContent, htmlBody } from '../app/email-sending/email-content';
import { sendEmail } from '../app/email-sending/email-delivery';
import { FullEmailAddress } from '../app/email-sending/emails';
import { AccountId, isAccountNotFound, makeAccountId } from '../domain/account';
import { getAccountIdByEmail, makePasswordResetConfirmationSecretHash } from '../domain/account-crypto';
import { loadAccount, resetAccountPassword } from '../domain/account-storage';
import { AppSettings } from '../domain/app-settings';
import { ConfirmationSecret, makeConfirmationSecret } from '../domain/confirmation-secrets';
import {
  deleteConfirmationSecret,
  loadConfirmationSecret,
  storeConfirmationSecret,
} from '../domain/confirmation-secrets-storage';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import {
  PasswordResetRequest,
  PasswordResetSecret,
  PasswordResetSecretData,
  PasswordResetConfirmation,
} from '../domain/password-reset';
import { makeHashedPassword } from '../domain/hashed-password';
import { makeNewPassword } from '../domain/new-password';
import { PagePath } from '../domain/page-path';
import { AppStorage } from '../domain/storage';
import { AppError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { Result, isErr, makeErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { enablePrivateNavbarCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { AppEnv } from './init-app';
import { initSession } from './session';

// TODO: Add api-test
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
    logError('Account not found', { accountId: accountId.value });
    return makeInputError<keyof PasswordResetRequest>('We don’t have an account registered with this email', 'email');
  }

  const secret: ConfirmationSecret = {
    kind: 'ConfirmationSecret',
    value: makePasswordResetConfirmationSecretHash(account.email, settings.hashingSalt),
  };

  const storeResult = storeForgotPasswordConfirmationSecret(storage, secret, accountId);

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
  const confirmationLink = new URL(si`https://${domainName}${PagePath.resetPassword}`);

  confirmationLink.searchParams.set('secret', secret.value);

  return {
    subject: 'Password reset link from FeedSubscription',
    htmlBody: htmlBody(si`
      <p>Hi there,</p>

      <p>Here is the link to reset your password at FeedSubscription.com:</p>

      <b><a href="${confirmationLink.toString()}">Take me to the password reset form</a></b>

      <p>If you did not ask to reset password, please ignore this message.</p>

      <p>Have a nice day.</p>
    `),
  };
}

function storeForgotPasswordConfirmationSecret(
  storage: AppStorage,
  secret: ConfirmationSecret,
  accountId: AccountId
): Result<void> {
  const secretData: PasswordResetSecretData = {
    accountId: accountId.value,
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

// TODO: Add api-test
export const confirmPasswordReset: AppRequestHandler = async function resetPassword(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { settings, storage, env }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: resetPassword.name, reqId });
  const request = makePasswordResetConfirmation(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makePasswordResetConfirmation.name}: ${request.reason}`);
    return makeInputError(si`Invalid ${request.field!}: ${request.reason}`, request.field);
  }

  const secretData = loadConfirmationSecret(storage, request.secret);
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

  const newHashedPassword = makeHashedPassword(hash(request.newPassword.value, settings.hashingSalt));

  if (isErr(newHashedPassword)) {
    logError(si`Failed to ${makeHashedPassword.name}: ${newHashedPassword.reason}`);
    return makeAppError();
  }

  const resetResult = resetAccountPassword(storage, accountId, newHashedPassword);

  if (isErr(resetResult)) {
    logError(si`Failed to ${resetAccountPassword.name}: ${resetResult.reason}`);
    return makeAppError();
  }

  const deleteResult = deleteConfirmationSecret(storage, request.secret);

  if (isErr(deleteResult)) {
    logError(si`Failed to ${deleteConfirmationSecret.name}: ${deleteResult.reason}`);
  }

  initSession(reqSession, accountId, account.email);
  sendPasswordResetConfirmationEmail(account.email, settings, env);

  const logData = {};
  const responseData = {};
  const cookies = [enablePrivateNavbarCookie];

  logInfo('User confirmed password change', { email: account.email.value, accountId: accountId.value });

  return makeSuccess('OK', logData, responseData, cookies);
};

function sendPasswordResetConfirmationEmail(accountEmail: EmailAddress, settings: AppSettings, env: AppEnv) {
  const emailContent = {
    subject: 'FeedSubscription password reset confirmation',
    htmlBody: htmlBody(si`
      <p>Hi there,</p>

      <p>At your request, your password at FeedSubscription.com has been reset.</p>

      <p>If you did not request a password reset, propmptly respond to this email
      and get in touch with us.</p>

      <p>Have a nice day.</p>
    `),
  };

  return sendEmail(settings.fullEmailAddress, accountEmail, settings.fullEmailAddress.emailAddress, emailContent, env);
}

function makeForgotPasswordSecret(data: unknown): Result<PasswordResetSecret> {
  return makeValues<PasswordResetSecret>(data, {
    accountId: makeAccountId,
  });
}

function makePasswordResetConfirmation(data: unknown): Result<PasswordResetConfirmation> {
  return makeValues<PasswordResetConfirmation>(data, {
    secret: makeConfirmationSecret,
    newPassword: makeNewPassword,
  });
}
