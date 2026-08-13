import { EmailContent, htmlBody } from '../app/email-sending/email-content';
import { sendEmail } from '../app/email-sending/email-delivery';
import {
  Account,
  AccountId,
  RegistrationConfirmationRequest,
  RegistrationConfirmationResponseData,
  RegistrationRequest,
  isAccountNotFound,
} from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { accountExists, confirmAccount, loadAccount, storeAccount } from '../domain/account-storage';
import { AppSettings } from '../domain/app-settings';
import {
  ConfirmationSecret,
  humanConfirmationSecretLifetime,
  isConfirmationSecretNotFound,
  makeConfirmationSecret,
  makeRandomConfirmationSecret,
} from '../domain/confirmation-secrets';
import {
  deleteConfirmationSecret,
  loadConfirmationSecret,
  storeConfirmationSecret,
} from '../domain/confirmation-secrets-storage';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { hashPassword } from '../domain/hashed-password';
import { PagePath } from '../domain/page-path';
import { makePassword } from '../domain/password';
import { PlanId, isSubscriptionPlan, makePlanId } from '../domain/plan';
import { AppStorage } from '../domain/storage';
import { AppError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { Result, hasKind, isErr, makeErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { enablePrivateNavbarCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { AppEnv } from './init-app';
import { initSession } from './session';
import { createCustomerWithSubscription, makePaddle } from './payment-integration';

export const registration: AppRequestHandler = async function registration(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
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
    logWarning('Attempting to register with the SDE plan');
    return makeInputError<keyof RegistrationRequest>('Please select one of the subscription plans', 'planId');
  }

  if (request.planId === PlanId.Free) {
    logWarning('Attempting to register with the Free plan');
    return makeInputError<keyof RegistrationRequest>('The Free plan has been discontinued', 'planId');
  }

  const accountId = await initAccount(storage, settings, request);

  if (isErr(accountId)) {
    logError(si`Failed to ${initAccount.name}`, { reason: accountId.reason, request });
    return makeAppError(accountId.reason);
  }

  if (isAccountAlreadyExists(accountId)) {
    logWarning('Account to register already exists', { request });
    return makeInputError<keyof RegistrationRequest>('Email already taken', 'email');
  }

  const { email } = request;
  const confirmationSecret = makeRandomConfirmationSecret();
  const sendResult = await sendConfirmationEmail(email, confirmationSecret, settings, env);

  if (isErr(sendResult)) {
    logError(si`Failed to ${sendConfirmationEmail.name}`, { reason: sendResult.reason, email: email.value });
    return makeAppError(sendResult.reason);
  }

  const result = storeRegistrationConfirmationSecret(storage, email, accountId, confirmationSecret);

  if (isErr(result)) {
    logError(si`Failed to ${storeRegistrationConfirmationSecret.name}`, {
      reason: result.reason,
      accountId: accountId.value,
    });
    return makeAppError(result.reason);
  }

  // Paddle is deliberately not touched here. Provisioning a customer before the address is
  // confirmed left one behind for every registration that was never confirmed — 68 of 69 on
  // prod — and nothing reclaims them. The checkout now happens in registrationConfirmation.
  initSession(reqSession, accountId, request.email);

  const logData = {};

  return makeSuccess('Account created. Welcome aboard! 🙂', logData);
};

function storeRegistrationConfirmationSecret(
  storage: AppStorage,
  email: EmailAddress,
  accountId: AccountId,
  confirmationSecret: ConfirmationSecret
): Result<void> {
  const confirmationSecretData = makeRegistrationConfirmationSecretData(accountId, email);
  const result = storeConfirmationSecret(storage, confirmationSecret, confirmationSecretData);

  if (isErr(result)) {
    return makeErr(si`Couldn’t store confirmation secret: ${result.reason}`);
  }
}

export interface RegistrationConfirmationSecretData {
  kind: 'RegistrationConfirmationSecretData'; // for inspectability
  accountId: AccountId;
  email: EmailAddress;
}

function makeRegistrationConfirmationSecretData(
  accountId: AccountId,
  email: EmailAddress
): RegistrationConfirmationSecretData {
  return {
    kind: 'RegistrationConfirmationSecretData',
    accountId,
    email,
  };
}

async function sendConfirmationEmail(
  recipient: EmailAddress,
  confirmationSecret: ConfirmationSecret,
  settings: AppSettings,
  env: AppEnv
): Promise<Result<void | AppError>> {
  const module = si`${registration.name}-${sendConfirmationEmail.name}`;
  const { logError, logInfo } = makeCustomLoggers({ email: recipient.value, module });

  const from = settings.fullEmailAddress;
  const replyTo = settings.fullEmailAddress.emailAddress;
  const emailContent = makeRegistrationConfirmationEmailContent(confirmationSecret, env.DOMAIN_NAME);
  const sendEmailResult = await sendEmail(from, recipient, replyTo, emailContent, env);

  if (isErr(sendEmailResult)) {
    logError(si`Failed to ${sendEmail.name}`, { reason: sendEmailResult.reason });
    return makeAppError('Couldn’t send registration confirmation email');
  }

  logInfo('Sent registration confirmation email');
}

export function makeRegistrationConfirmationEmailContent(
  confirmationSecret: ConfirmationSecret,
  domainName: string
): EmailContent {
  const confirmationLink = new URL(si`https://${domainName}${PagePath.registrationConfirmation}`);

  confirmationLink.searchParams.set('secret', confirmationSecret.value);

  return {
    subject: 'Please confirm FeedSubscription.com registration',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>
        Please confirm the registration at
        <a href="https://FeedSubscription.com">FeedSubscription.com</a>
        by clicking the link below:
      </p>

      <a href="${confirmationLink.toString()}">
        ${confirmationLink.toString()}
      </a>

      <p>
        The link above takes you to the payment step. Once that goes through,
        you will be able to register your blog feed and embed the Subscribe
        Form. Please note that this registration link expires in
        ${humanConfirmationSecretLifetime}.
      </p>

      <p>
        If you did not register, please ignore this message.
      </p>

      <p>
        Warmly,<br/>
        FeedSubscription.com
      </p>

      <br/>
      <br/>
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

async function initAccount(
  storage: AppStorage,
  settings: AppSettings,
  request: RegistrationRequest
): Promise<Result<AccountId | AccountAlreadyExists>> {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: initAccount.name });

  const accountId = getAccountIdByEmail(request.email, settings.hashingSalt);
  const exists = accountExists(storage, accountId);

  if (isErr(exists)) {
    return exists;
  }

  // Cheap pre-check, so a registration flood doesn’t pay for a scrypt hash per attempt.
  if (exists) {
    logWarning('Account already exists', { email: request.email.value });
    return makeAccountAlreadyExists();
  }

  const hashedPassword = await hashPassword(request.password.value);

  // Hashing yields to the event loop, so check again with nothing between here and the
  // store: two concurrent registrations for one email must not both write the account.
  const existsAfterHashing = accountExists(storage, accountId);

  if (isErr(existsAfterHashing)) {
    return existsAfterHashing;
  }

  if (existsAfterHashing) {
    logWarning('Account already exists', { email: request.email.value });
    return makeAccountAlreadyExists();
  }

  const account: Account = {
    planId: PlanId.PendingPayment,
    email: request.email,
    hashedPassword,
    confirmationTimestamp: undefined,
    creationTimestamp: new Date(),
    requestedPlanId: request.planId,
    isAdmin: false,
  };

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
  { storage, env }
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

  // Confirmation has already succeeded and the secret is spent, so nothing below may turn
  // into a failed response: a single-use link the user cannot replay must not strand them.
  // A missing token leaves the account on PendingPayment, recoverable from the account page.
  const checkout = await startCheckout(storage, env, accountId, email);
  const logData = {};
  const responseData: RegistrationConfirmationResponseData = {
    sessionId: reqSession.id,
    paymentToken: checkout.paymentToken,
    // maybeConfirmPayment no-ops on a non-subscription plan, and the account reads
    // PendingPayment until Paddle pays out, so the page needs the requested plan instead.
    planId: checkout.planId,
  };
  const cookies = [enablePrivateNavbarCookie];

  return makeSuccess('Account registration confirmed.', logData, responseData, cookies);
};

interface Checkout {
  paymentToken: string;
  planId: string;
}

async function startCheckout(
  storage: AppStorage,
  env: AppEnv,
  accountId: AccountId,
  email: EmailAddress
): Promise<Checkout> {
  const { logError, logInfo } = makeCustomLoggers({ module: startCheckout.name, email: email.value });
  const empty: Checkout = { paymentToken: '', planId: '' };
  const account = loadAccount(storage, accountId);

  if (isErr(account) || isAccountNotFound(account)) {
    logError('Couldn’t load the just-confirmed account to start checkout');
    return empty;
  }

  const { requestedPlanId } = account;

  // Registrations from before requestedPlanId was recorded were charged at registration
  // under the old flow, so they need no checkout here. Remove this branch once every
  // secret issued under that flow has expired — confirmationSecretLifetimeMs after deploy.
  if (!requestedPlanId) {
    logInfo('Confirmed a registration that predates requestedPlanId; no checkout to start');
    return empty;
  }

  if (!isSubscriptionPlan(requestedPlanId)) {
    logError(si`Requested plan is not a subscription plan: ${requestedPlanId}`);
    return empty;
  }

  const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);
  const result = await createCustomerWithSubscription(paddle, email, requestedPlanId);

  if (isErr(result)) {
    logError(si`Failed to ${createCustomerWithSubscription.name}: ${result.reason}`);
    return empty;
  }

  return { paymentToken: result.value, planId: requestedPlanId };
}

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
