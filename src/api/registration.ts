import { EmailContent, htmlBody } from '../app/email-sending/email-content';
import { sendEmail } from '../app/email-sending/email-delivery';
import {
  Account,
  AccountId,
  RegistrationConfirmationRequest,
  RegistrationRequest,
  RegistrationResponseData,
} from '../domain/account';
import { getAccountIdByEmail, makeRegistrationConfirmationSecretHash } from '../domain/account-crypto';
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
import { PlanId, makePlanId } from '../domain/plan';
import { AppStorage } from '../domain/storage';
import { AppError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { Result, hasKind, isErr, makeErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { enablePrivateNavbarCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { AppEnv } from './init-app';
import { initSession } from './session';
import { createStripeRecords } from './stripe-integration';

export const registration: AppRequestHandler = async function registration(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { env, storage, settings }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: registration.name, reqId });
  const request = makeRegistrationRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeRegistrationRequest.name}`, {
      field: request.field,
      reason: request.reason,
      reqBody,
    });
    return makeInputError(request.reason, request.field);
  }

  if (request.planId === PlanId.SDE) {
    logWarning('Attemtping to register with the SDE plan');
    return makeInputError('SDE Plan is assigned by hand', 'planId' as keyof RegistrationRequest);
  }

  const accountId = initAccount(storage, settings, request);

  if (isErr(accountId)) {
    logError(si`Failed to ${initAccount.name}`, { reason: accountId.reason, request });
    return makeAppError(accountId.reason);
  }

  if (isAccountAlreadyExists(accountId)) {
    logWarning('Account to register already exists', { request });
    return makeInputError('Email already taken', 'email' as keyof RegistrationRequest);
  }

  const { email, planId } = request;
  const sendResult = await sendConfirmationEmail(email, settings, env);

  if (isErr(sendResult)) {
    logError(si`Failed to ${sendConfirmationEmail.name}`, { reason: sendResult.reason, email: email.value });
    return makeAppError(sendResult.reason);
  }

  const confirmationSecret = makeRegistrationConfirmationSecretHash(email, settings.hashingSalt);
  const result = storeRegistrationConfirmationSecret(storage, email, accountId, confirmationSecret);

  if (isErr(result)) {
    logError(si`Failed to ${storeRegistrationConfirmationSecret.name}`, {
      reason: result.reason,
      accountId: accountId.value,
    });
    return makeAppError(result.reason);
  }

  const clientSecret = await createStripeRecords(
    storage,
    env.STRIPE_SECRET_KEY,
    env.STRIPE_PRICE_ID,
    accountId,
    email,
    planId
  );

  if (isErr(clientSecret)) {
    logError(si`Failed to ${createStripeRecords.name}: ${clientSecret.reason}`, { email: email.value });
    return makeAppError();
  }

  const logData = {};
  const responseData: RegistrationResponseData = { clientSecret };

  return makeSuccess('Account created. Welcome aboard! 🙂', logData, responseData);
};

function storeRegistrationConfirmationSecret(
  storage: AppStorage,
  email: EmailAddress,
  accountId: AccountId,
  secret: string
): Result<void> {
  const confirmationSecret = makeConfirmationSecret(secret);

  if (isErr(confirmationSecret)) {
    return makeErr(si`Couldn’t make confirmation secret: ${confirmationSecret.reason}`);
  }

  const confirmationSecretData = makeRegistrationConfirmationSecretData(accountId, email);
  const result = storeConfirmationSecret(storage, confirmationSecret, confirmationSecretData);

  if (isErr(result)) {
    return makeErr(si`Couldn’t store confirmation secret: ${result.reason}`);
  }
}

interface RegistrationConfirmationSecretData {
  kind: 'RegistrationConfirmationSecretData'; // for inspectability
  accountId: AccountId;
  email: EmailAddress;
  timestamp: Date;
}

function makeRegistrationConfirmationSecretData(
  accountId: AccountId,
  email: EmailAddress
): RegistrationConfirmationSecretData {
  return {
    kind: 'RegistrationConfirmationSecretData',
    accountId,
    email,
    timestamp: new Date(),
  };
}

async function sendConfirmationEmail(
  recipient: EmailAddress,
  settings: AppSettings,
  env: AppEnv
): Promise<Result<void | AppError>> {
  const module = si`${registration.name}-${sendConfirmationEmail.name}`;
  const { logError, logInfo } = makeCustomLoggers({ email: recipient.value, module });

  const from = settings.fullEmailAddress;
  const replyTo = settings.fullEmailAddress.emailAddress;
  const emailContent = makeRegistrationConfirmationEmailContent(recipient, settings.hashingSalt, env.DOMAIN_NAME);
  const sendEmailResult = await sendEmail(from, recipient, replyTo, emailContent, env);

  if (isErr(sendEmailResult)) {
    logError(si`Failed to ${sendEmail.name}`, { reason: sendEmailResult.reason });
    return makeAppError('Couldn’t send registration confirmation email');
  }

  logInfo('Sent registration confirmation email');
}

export function makeRegistrationConfirmationEmailContent(
  email: EmailAddress,
  hashingSalt: string,
  domainName: string
): EmailContent {
  const confirmationLink = new URL(si`https://${domainName}${PagePath.registrationConfirmation}`);
  const secret = makeRegistrationConfirmationSecretHash(email, hashingSalt);

  confirmationLink.searchParams.set('secret', secret);

  return {
    subject: 'Please confirm FeedSubscription registration',
    htmlBody: htmlBody(si`
      <p>Hi there,</p>

      <p>Please confirm FeedSubscription.com registration by clicking the link below:</p>

      <p><a href="${confirmationLink.toString()}">Yes, I confirm registration</a>.</p>

      <p>If you did not register, please ignore this message.</p>

      <p>Have a nice day.</p>
    `),
  };
}

export function makeRegistrationRequest(data: unknown): Result<RegistrationRequest> {
  return makeValues<RegistrationRequest>(data, {
    planId: makePlanId,
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
  storage: AppStorage,
  settings: AppSettings,
  request: RegistrationRequest
): Result<AccountId | AccountAlreadyExists> {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: initAccount.name });

  const hashedPassword = hash(request.password.value, settings.hashingSalt);
  const account: Account = {
    planId: request.planId,
    email: request.email,
    hashedPassword: makeHashedPassword(hashedPassword) as HashedPassword,
    confirmationTimestamp: undefined,
    creationTimestamp: new Date(),
    isAdmin: false,
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

  logInfo('User registered', { email: account.email.value, planId: account.planId });

  return accountId;
}

export const registrationConfirmation: AppRequestHandler = async function registrationConfirmation(
  _reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage }
) {
  const { logWarning } = makeCustomLoggers({ module: registrationConfirmation.name });
  const request = makeRegistrationConfirmationRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeRegistrationConfirmationRequest.name}`, { reason: request.reason, reqBody });
    return makeInputError('Invalid registration confirmation link');
  }

  const { secret } = request;
  const confirmationSecretData = confirmAccountBySecret(storage, secret);

  if (isErr(confirmationSecretData)) {
    return makeAppError(confirmationSecretData.reason);
  }

  const { accountId, email } = confirmationSecretData;

  initSession(reqSession, accountId, email);

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

function confirmAccountBySecret(
  storage: AppStorage,
  secret: ConfirmationSecret
): Result<RegistrationConfirmationSecretData> {
  const { logWarning, logError, logInfo } = makeCustomLoggers({
    module: confirmAccountBySecret.name,
    secret: secret.value,
  });

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

  logInfo('User confirmed registration', { accountId: data.accountId.value, data: data.email.value });

  return data;
}
