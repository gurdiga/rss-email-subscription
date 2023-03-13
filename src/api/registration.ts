import { EmailDeliveryEnv } from '../app/email-sending/email-delivery';
import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import { Account, AccountId, RegistrationConfirmationRequest, RegistrationRequest } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { accountExists, confirmAccount, storeAccount } from '../domain/account-storage';
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
import { makeEmailAddress } from '../domain/email-address-making';
import { HashedPassword, makeHashedPassword } from '../domain/hashed-password';
import { PagePath } from '../domain/page-path';
import { makePassword } from '../domain/password';
import { AppStorage } from '../domain/storage';
import { AppError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { requireEnv } from '../shared/env';
import { hasKind, isErr, makeErr, makeValues, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { enablePrivateNavbarCookie } from './app-cookie';
import { App } from './init-app';
import { RequestHandler } from './request-handler';
import { initSession } from './session';

export const registration: RequestHandler = async function registration(reqId, reqBody, _reqParams, _reqSession, app) {
  const { logWarning, logError } = makeCustomLoggers({ module: registration.name, reqId });
  const request = makeRegistrationRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeRegistrationRequest.name}`, { reason: request.reason, reqBody });
    return makeInputError(request.reason, request.field);
  }

  const accountId = initAccount(app, request);

  if (isErr(accountId)) {
    logError(si`Failed to ${initAccount.name}`, { reason: accountId.reason, request });
    return makeAppError(accountId.reason);
  }

  if (isAccountAlreadyExists(accountId)) {
    logWarning('Account to register already exists', { request });
    return makeInputError('Email already taken', 'email' as keyof RegistrationRequest);
  }

  const { email } = request;
  const sendResult = await sendConfirmationEmail(email, app.settings);

  if (isErr(sendResult)) {
    logError(si`Failed to ${sendConfirmationEmail.name}`, { reason: sendResult.reason, email: email.value });
    return makeAppError(sendResult.reason);
  }

  const result = storeRegistrationConfirmationSecret(app, email, accountId);

  if (isErr(result)) {
    logError(si`Failed to ${storeRegistrationConfirmationSecret.name}`, {
      reason: result.reason,
      accountId: accountId.value,
    });
    return makeAppError(result.reason);
  }

  return makeSuccess('Account created. Welcome aboard! 🙂');
};

function storeRegistrationConfirmationSecret(
  { settings, storage }: App,
  emailAddress: EmailAddress,
  accountId: AccountId
): Result<void> {
  const emailAddressHash = hash(emailAddress.value, si`confirmation-secret-${settings.hashingSalt}`);
  const confirmationSecret = makeConfirmationSecret(emailAddressHash);

  if (isErr(confirmationSecret)) {
    return makeErr(si`Couldn’t make confirmation secret: ${confirmationSecret.reason}`);
  }

  const confirmationSecretData = makeRegistrationConfirmationSecretData(accountId);
  const result = storeConfirmationSecret(storage, confirmationSecret, confirmationSecretData);

  if (isErr(result)) {
    return makeErr(si`Couldn’t store confirmation secret: ${result.reason}`);
  }
}

interface RegistrationConfirmationSecretData {
  kind: 'RegistrationConfirmationSecretData'; // for inspectability
  accountId: AccountId;
  timestamp: Date;
}

function makeRegistrationConfirmationSecretData(accountId: AccountId): RegistrationConfirmationSecretData {
  return {
    kind: 'RegistrationConfirmationSecretData',
    accountId,
    timestamp: new Date(),
  };
}

async function sendConfirmationEmail(recipient: EmailAddress, settings: AppSettings): Promise<Result<void | AppError>> {
  const module = si`${registration.name}-${sendConfirmationEmail.name}`;
  const { logError, logInfo } = makeCustomLoggers({ email: recipient.value, module });

  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    return makeAppError('Environment error');
  }

  const from = settings.fullEmailAddress;
  const replyTo = settings.fullEmailAddress.emailAddress;
  const confirmationLink = makeRegistrationConfirmationLink(recipient, settings.hashingSalt, env.DOMAIN_NAME);
  const emailContent = makeRegistrationConfirmationEmailContent(confirmationLink);
  const sendEmailResult = await sendEmail(from, recipient, replyTo, emailContent, env);

  if (isErr(sendEmailResult)) {
    logError(si`Failed to ${sendEmail.name}`, { reason: sendEmailResult.reason });
    return makeAppError('Couldn’t send registration confirmation email');
  }

  logInfo('Sent registration confirmation email');
}

export function makeRegistrationConfirmationLink(to: EmailAddress, appHashingSalt: string, domainName: string): URL {
  const url = new URL(si`https://${domainName}${PagePath.registrationConfirmation}`);
  const secret = hash(to.value, si`confirmation-secret-${appHashingSalt}`);

  url.searchParams.set('secret', secret);

  return url;
}

export function makeRegistrationConfirmationEmailContent(confirmationLink: URL): EmailContent {
  return {
    subject: 'Please confirm FeedSubscription registration',
    htmlBody: si`
      <p>Hi there,</p>

      <p>Please confirm <b><font color="#0163ee">Feed</font>Subscription</b> registration by clicking the link below:</p>

      <p><a href="${confirmationLink.toString()}">Yes, I confirm registration</a>.</p>

      <p>If you did not register, please ignore this message.</p>

      <p>Have a nice day.</p>
    `,
  };
}

export function makeRegistrationRequest(data: unknown): Result<RegistrationRequest> {
  return makeValues<RegistrationRequest>(data, {
    email: makeEmailAddress,
    password: makePassword,
  });
}

interface AccountAlreadyExists {
  kind: 'AccountAlreadyExists';
}

function makeAccountAlreadyExists(): AccountAlreadyExists {
  return { kind: 'AccountAlreadyExists' };
}

export function isAccountAlreadyExists(x: any): x is AccountAlreadyExists {
  return hasKind(x, 'AccountAlreadyExists');
}

function initAccount(
  { storage, settings }: App,
  request: RegistrationRequest
): Result<AccountId | AccountAlreadyExists> {
  const module = si`${registration.name}-${initAccount.name}`;
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module });

  const hashedPassword = hash(request.password.value, settings.hashingSalt);
  const account: Account = {
    email: request.email,
    hashedPassword: makeHashedPassword(hashedPassword) as HashedPassword,
    confirmationTimestamp: undefined,
    creationTimestamp: new Date(),
  };

  const accountId = getAccountIdByEmail(request.email, settings.hashingSalt);

  if (accountExists(storage, accountId)) {
    logWarning('Account already exists', { email: request.email.value });
    return makeAccountAlreadyExists();
  }

  const storeAccountResult = storeAccount(storage, accountId, account);

  if (isErr(storeAccountResult)) {
    logError(si`Couldn’t ${storeAccount.name}`, { reason: storeAccountResult.reason });
    return makeErr('Couldn’t store account data');
  }

  logInfo('User registered', account);

  return accountId;
}

export const registrationConfirmation: RequestHandler = async function registrationConfirmation(
  _reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage }
) {
  const { logWarning } = makeCustomLoggers({ module: registrationConfirmation.name });
  const request = makeRegistrationConfirmationRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeRegistrationConfirmationRequest.name}`, { reason: request.reason, reqBody: reqBody });
    return makeInputError('Invalid registration confirmation link');
  }

  const { secret } = request;
  const accountId = confirmAccountBySecret(storage, secret);

  if (isErr(accountId)) {
    return makeAppError(accountId.reason);
  }

  initSession(reqSession, accountId);

  const logData = {};
  const responseData = { sessionId: reqSession.id };
  const cookies = [enablePrivateNavbarCookie];

  return makeSuccess('Account registration confirmed.', logData, responseData, cookies);
};

function makeRegistrationConfirmationRequest(data: unknown): Result<RegistrationConfirmationRequest> {
  return makeValues<RegistrationConfirmationRequest>(data, {
    secret: makeConfirmationSecret,
  });
}

function confirmAccountBySecret(storage: AppStorage, secret: ConfirmationSecret): Result<AccountId> {
  const module = si`${registrationConfirmation.name}-${confirmAccountBySecret.name}`;
  const { logWarning, logError, logInfo } = makeCustomLoggers({ module, secret: secret.value });

  const data = loadConfirmationSecret<RegistrationConfirmationSecretData>(storage, secret);

  if (isErr(data)) {
    logError(si`Failed to ${loadConfirmationSecret.name}`, { reason: data.reason });
    return makeErr('Invalid registration confirmation link');
  }

  if (isConfirmationSecretNotFound(data)) {
    logWarning('Confirmation secret not found', { secret: secret.value });
    return makeErr('Confirmation link expired or has already been confirmed');
  }

  const { accountId } = data;
  const confirmAccountResult = confirmAccount(storage, accountId);

  if (isErr(confirmAccountResult)) {
    logWarning(si`Failed to ${confirmAccount.name}`, {
      accountId: accountId.value,
      reason: confirmAccountResult.reason,
    });
    return makeErr('Application error');
  }

  const deleteResult = deleteConfirmationSecret(storage, secret);

  if (isErr(deleteResult)) {
    logError(si`Failed to ${deleteConfirmationSecret.name}`, {
      reason: deleteResult.reason,
      secret: secret.value,
    });
    return makeErr('Application error');
  }

  logInfo('User confirmed registration');

  return accountId;
}
