import { EmailContent, htmlBody } from '../app/email-sending/email-content';
import { sendEmail } from '../app/email-sending/email-delivery';
import {
  Account,
  AccountId,
  isAccountNotFound,
  RegistrationConfirmationRequest,
  RegistrationRequest,
  RegistrationResponseData,
} from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { accountExists, confirmAccount, loadAccount, storeAccount } from '../domain/account-storage';
import { AppSettings } from '../domain/app-settings';
import {
  accountControlSecretKinds,
  ConfirmationSecret,
  humanConfirmationSecretLifetime,
  isConfirmationSecretNotFound,
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
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { hashPassword } from '../domain/hashed-password';
import { PagePath } from '../domain/page-path';
import { makePassword } from '../domain/password';
import { PlanId, isSubscriptionPlan, makePlanId } from '../domain/plan';
import { AppStorage } from '../domain/storage';
import { AppError, InputError, makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { Result, hasKind, isErr, makeErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { enablePrivateNavbarCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { AppEnv } from './init-app';
import { initSession } from './session';
import {
  createCustomerWithSubscription,
  isPaddleCustomerTaken,
  makeContactSupportError,
  makePaddle,
} from './payment-integration';

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
    logWarning('Attempting to register with the SDE plan');
    return makeInputError<keyof RegistrationRequest>('Please select one of the subscription plans', 'planId');
  }

  if (request.planId === PlanId.Free) {
    logWarning('Attempting to register with the Free plan');
    return makeInputError<keyof RegistrationRequest>('The Free plan has been discontinued', 'planId');
  }

  const accountId = initAccount(storage, settings, request);

  if (isErr(accountId)) {
    logError(si`Failed to ${initAccount.name}`, { reason: accountId.reason, request });
    return makeAppError(accountId.reason);
  }

  if (isAccountAlreadyExists(accountId)) {
    logWarning('Account to register already exists', { request });
    return makeInputError<keyof RegistrationRequest>('Email already taken', 'email');
  }

  const { email, planId } = request;
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

  let paymentToken = '';

  if (isSubscriptionPlan(request.planId)) {
    const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);
    const result = await createCustomerWithSubscription(paddle, storage, accountId, planId);

    if (isErr(result)) {
      logError(si`Failed to ${createCustomerWithSubscription.name}: ${result.reason}`, { email: email.value });
      return makeAppError();
    }

    if (isPaddleCustomerTaken(result)) {
      logError('Refusing to adopt the Paddle customer for this email', { reason: result.reason, email: email.value });
      return makeContactSupportError(settings);
    }

    paymentToken = result.value;
  }

  const logData = {};
  const responseData: RegistrationResponseData = { paymentToken };

  // No session until the address is confirmed: an account at an address its holder
  // doesn’t control must not be able to act. The checkout that follows calls only
  // routes that need none.
  return makeSuccess('Account created. Welcome aboard! 🙂', logData, responseData);
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
  const confirmationLink = makeConfirmationLink(domainName, PagePath.registrationConfirmation, confirmationSecret);

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
        The link opens a page where you choose your password. Once you have done that,
        you will have completed the registration process and will be able to register
        your blog feed and embed the Subscribe Form. Please note that this registration
        link expires in ${humanConfirmationSecretLifetime}.
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

  const accountId = getAccountIdByEmail(request.email, settings.hashingSalt);
  const exists = accountExists(storage, accountId);

  if (isErr(exists)) {
    return exists;
  }

  if (exists) {
    logWarning('Account already exists', { email: request.email.value });
    return makeAccountAlreadyExists();
  }

  const now = new Date();
  const account: Account = {
    planId: PlanId.PendingPayment,
    email: request.email,
    hashedPassword: undefined,
    confirmationTimestamp: undefined,
    creationTimestamp: now,
    isAdmin: false,
    passwordChangedAt: now,
    paddleCustomerId: undefined,
    lastPaddlePlanEventAt: undefined,
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
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage },
  regenerateSession
) {
  const { logWarning, logError, logInfo } = makeCustomLoggers({ module: registrationConfirmation.name, reqId });
  const request = makeRegistrationConfirmationRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeRegistrationConfirmationRequest.name}`, { reason: request.reason });

    return request.field === 'password'
      ? makeInputError(request.reason, request.field)
      : makeInputError('Invalid registration confirmation link');
  }

  const { secret, password } = request;
  const secretData = loadRegistrationSecretData(storage, secret);

  if (isErr(secretData)) {
    logError(si`Failed to ${loadRegistrationSecretData.name}`, { reason: secretData.reason });
    return makeAppError();
  }

  if (isConfirmationSecretNotFound(secretData)) {
    logWarning('Registration confirmation secret not found');
    return makeInputError(expiredLinkMessage);
  }

  const { accountId, email } = secretData;
  const isConfirmable = checkConfirmable(storage, accountId, secret);

  if (!isConfirmable.isConfirmable) {
    return isConfirmable.response;
  }

  const hashedPassword = await hashPassword(password.value);

  // Hashing yields to the event loop, so the link may have been used or the account
  // confirmed meanwhile. Check again, with nothing awaited between here and the store.
  const secretDataAfterHashing = loadRegistrationSecretData(storage, secret);

  if (isErr(secretDataAfterHashing) || isConfirmationSecretNotFound(secretDataAfterHashing)) {
    return makeInputError(expiredLinkMessage);
  }

  const isStillConfirmable = checkConfirmable(storage, accountId, secret);

  if (!isStillConfirmable.isConfirmable) {
    return isStillConfirmable.response;
  }

  const confirmResult = confirmAccount(storage, accountId, hashedPassword);

  if (isErr(confirmResult) || isAccountNotFound(confirmResult)) {
    logError(si`Failed to ${confirmAccount.name}`, { accountId: accountId.value });
    return makeAppError();
  }

  const deleteResult = deleteConfirmationSecret(storage, secret);

  if (isErr(deleteResult)) {
    logError(si`Failed to ${deleteConfirmationSecret.name}`, { reason: deleteResult.reason });
  }

  // As after a password reset: anything issued before the password existed shouldn’t
  // outlive it. The account is confirmed, so a failure here is logged, not reported.
  const revokeResult = revokeAccountSecrets(storage, accountId, accountControlSecretKinds);

  if (isErr(revokeResult)) {
    logError(si`Failed to ${revokeAccountSecrets.name}: ${revokeResult.reason}`, { accountId: accountId.value });
  }

  logInfo('User confirmed registration', { accountId: accountId.value, email: email.value });

  const newReqSession = await regenerateSession();
  const sessionInitResult = initSession(storage, newReqSession, accountId, email);

  if (isErr(sessionInitResult)) {
    logWarning(si`Failed to ${initSession.name}: ${sessionInitResult.reason}`);
    return makeAppError(sessionInitResult.reason);
  }

  const logData = {};
  const responseData = { sessionId: newReqSession.id };
  const cookies = [enablePrivateNavbarCookie];

  return makeSuccess('Account registration confirmed.', logData, responseData, cookies);
};

const expiredLinkMessage = 'This confirmation link has expired or has already been used.';

function makeRegistrationConfirmationRequest(data: unknown): Result<RegistrationConfirmationRequest> {
  return makeValues<RegistrationConfirmationRequest>(data, {
    secret: makeConfirmationSecret,
    password: makePassword,
  });
}

function loadRegistrationSecretData(storage: AppStorage, secret: ConfirmationSecret) {
  return loadConfirmationSecretOfKind<RegistrationConfirmationSecretData>(
    storage,
    secret,
    'RegistrationConfirmationSecretData'
  );
}

type Confirmability = { isConfirmable: true } | { isConfirmable: false; response: InputError | AppError };

// An already-confirmed account has a password its owner chose. Letting a leftover
// registration link set another would make it a second password-reset link.
function checkConfirmable(storage: AppStorage, accountId: AccountId, secret: ConfirmationSecret): Confirmability {
  const { logError, logWarning } = makeCustomLoggers({ module: checkConfirmable.name, accountId: accountId.value });
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return { isConfirmable: false, response: makeAppError() };
  }

  if (isAccountNotFound(account)) {
    logWarning('Account to confirm not found');
    deleteConfirmationSecret(storage, secret);
    return { isConfirmable: false, response: makeInputError(expiredLinkMessage) };
  }

  if (account.confirmationTimestamp) {
    logWarning('Account already confirmed');
    deleteConfirmationSecret(storage, secret);
    return { isConfirmable: false, response: makeInputError('This account is already confirmed. Please log in.') };
  }

  return { isConfirmable: true };
}
