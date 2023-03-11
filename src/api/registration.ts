import { EmailDeliveryEnv } from '../app/email-sending/email-delivery';
import { EmailContent, sendEmail } from '../app/email-sending/item-sending';
import {
  Account,
  AccountId,
  RegistrationRequest,
  RegistrationRequestData,
  RegistrationConfirmationRequest,
  RegistrationConfirmationRequestData,
} from '../domain/account';
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
import { getTypeName, hasKind, isErr, isObject, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { enablePrivateNavbarCookie } from './app-cookie';
import { App } from './init-app';
import { RequestHandler } from './request-handler';
import { initSession } from './session';

export const registration: RequestHandler = async function registration(_reqId, reqBody, _reqParams, _reqSession, app) {
  const request = makeRegistrationRequest(reqBody);

  if (isErr(request)) {
    return makeInputError(request.reason, request.field);
  }

  const initAccountResult = initAccount(app, request);

  if (isErr(initAccountResult)) {
    return makeAppError(initAccountResult.reason);
  }

  if (isAccountAlreadyExists(initAccountResult)) {
    return makeInputError('Email already taken', 'email' as keyof RegistrationRequest);
  }

  const { email } = request;
  const sendConfirmationEmailResult = await sendConfirmationEmail(email, app.settings);

  if (isErr(sendConfirmationEmailResult)) {
    return makeAppError(sendConfirmationEmailResult.reason);
  }

  const accountId = initAccountResult;
  const storeConfirmationSecretResult = storeRegistrationConfirmationSecret(app, email, accountId);

  if (isErr(storeConfirmationSecretResult)) {
    return makeAppError(storeConfirmationSecretResult.reason);
  }

  return makeSuccess('Account created. Welcome aboard! 🙂');
};

export function storeRegistrationConfirmationSecret(
  { settings, storage }: App,
  emailAddress: EmailAddress,
  accountId: AccountId
): Result<void> {
  const module = si`${registration.name}-${storeRegistrationConfirmationSecret.name}`;
  const { logError, logInfo } = makeCustomLoggers({ accountId, module });

  const emailAddressHash = hash(emailAddress.value, si`confirmation-secret-${settings.hashingSalt}`);
  const confirmationSecret = makeConfirmationSecret(emailAddressHash);

  if (isErr(confirmationSecret)) {
    logError(si`Failed to ${makeConfirmationSecret.name}`, { reason: confirmationSecret.reason });
    return makeErr('Couldn’t make confirmation secret');
  }

  const confirmationSecretData: RegistrationConfirmationSecretData = { accountId };
  const result = storeConfirmationSecret(storage, confirmationSecret, confirmationSecretData);

  if (isErr(result)) {
    logError(si`Failed to ${storeConfirmationSecret.name}`, { reason: result.reason });
    return makeErr('Couldn’t store confirmation secret');
  }

  logInfo('Stored registration confirmation secret');
}

interface RegistrationConfirmationSecretData {
  accountId: AccountId;
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
  if (!isObject(data)) {
    return makeErr(si`Invalid request data type: expected [object] but got [${getTypeName(data)}]`);
  }

  const emailKeyName: keyof RegistrationRequestData = 'email';

  if (!(emailKeyName in data)) {
    return makeErr(si`Invalid request: missing "${emailKeyName}" prop`, emailKeyName);
  }

  const email = makeEmailAddress(data[emailKeyName], emailKeyName);

  if (isErr(email)) {
    return email;
  }

  const passwordKeyName: keyof RegistrationRequestData = 'password';

  if (!(passwordKeyName in data)) {
    return makeErr(si`Invalid request: missing "${passwordKeyName}" prop`, passwordKeyName);
  }

  const password = makePassword(data[passwordKeyName]);

  if (isErr(password)) {
    return password;
  }

  return { email, password };
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
  if (!isObject(data)) {
    return makeErr(si`Invalid request data type: expected [object] but got [${getTypeName(data)}]`);
  }

  const keyName: keyof RegistrationConfirmationRequestData = 'secret';

  if (!(keyName in data)) {
    return makeErr(si`Invalid request: missing "${keyName}"`, keyName);
  }

  const secret = makeConfirmationSecret(data['secret']);

  if (isErr(secret)) {
    return makeErr(si`Invalid request "${keyName}": ${secret.reason}`, keyName);
  }

  return { secret };
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
