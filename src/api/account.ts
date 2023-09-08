import { htmlBody } from '../app/email-sending/email-content';
import { sendEmail } from '../app/email-sending/email-delivery';
import {
  AccountId,
  DeleteAccountRequest,
  DeleteAccountRequestData,
  EmailChangeConfirmationRequest,
  EmailChangeRequest,
  EmailChangeRequestData,
  isAccountNotFound,
  PasswordChangeRequest,
  PasswordChangeRequestData,
  PlanChangeRequest,
  PlanChangeRequestData,
  PlanChangeResponseData,
  UiAccount,
} from '../domain/account';
import { makeEmailChangeConfirmationSecretHash } from '../domain/account-crypto';
import { deleteAccount, loadAccount, setAccountEmail, storeAccount } from '../domain/account-storage';
import { AppSettings } from '../domain/app-settings';
import {
  ConfirmationSecret,
  EmailChangeRequestSecretData,
  humanConfirmationSecretLifetime,
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
import { isSubscriptionPlan, makePlanId, PlanId, Plans } from '../domain/plan';
import { AppStorage } from '../domain/storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr, makeValues, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { disablePrivateNavbarCookie, unsetDemoCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { AppEnv } from './init-app';
import { checkSession, deinitSession, isAuthenticatedSession, isDemoSession } from './session';
import {
  cancelCustomerSubscription,
  changeCustomerSubscription,
  createCustomerWithSubscription,
  loadCardDescription,
  makeStripe,
} from './stripe-integration';

export const loadCurrentAccount: AppRequestHandler = async function loadCurrentAccount(
  reqId,
  _reqBody,
  _reqParams,
  reqSession,
  { storage }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: loadCurrentAccount.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const account = loadAccount(storage, accountId);

  if (isAccountNotFound(account)) {
    logWarning('Account not found', { accountId: accountId.value });
    return makeNotAuthenticatedError();
  }

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return makeAppError();
  }

  let cardDescription = '';

  if (isSubscriptionPlan(account.planId)) {
    const loadedDescription = loadCardDescription(storage, accountId);

    if (isErr(loadedDescription)) {
      logError(si`Failed to ${loadCardDescription.name}`, { reason: loadedDescription.reason });
      return makeAppError();
    }

    if (!loadedDescription) {
      logError(si`Empty card description`);
      return makeAppError();
    }

    cardDescription = loadedDescription;
  }

  const logData = {};
  const responseData: UiAccount = {
    email: account.email.value,
    planId: account.planId,
    isAdmin: !!account.isAdmin,
    cardDescription,
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
  const oldEmail = isDemoSession(reqSession)
    ? newEmail
    : setAccountEmail(storage, accountId, newEmail, settings.hashingSalt);

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
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Please note that the account email at FeedSubscription.com
      has been changed from <b>${oldEmail.value}</b> to <b>${newEmail.value}</b>.</p>

      <p>Have a nice day.</p>
    `),
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
    logWarning(si`Failed to ${makePasswordChangeRequest.name}`, {
      field: request.field,
      reason: request.reason,
      reqBody,
    });
    return makeInputError(request.reason, request.field);
  }

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason, accountId: accountId.value });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logError('Account not found', { accountId: accountId.value });
    return makeAppError();
  }

  const currentHashedPassword = hash(request.currentPassword.value, settings.hashingSalt);

  if (currentHashedPassword !== account.hashedPassword.value) {
    return makeInputError<keyof PasswordChangeRequest>('Current password doesn’t match', 'currentPassword');
  }

  if (request.currentPassword.value === request.newPassword.value) {
    return makeInputError<keyof PasswordChangeRequest>('New password can’t be the same as the old one', 'newPassword');
  }

  const newHashedPassword = makeHashedPassword(hash(request.newPassword.value, settings.hashingSalt));

  if (isErr(newHashedPassword)) {
    logError(si`Failed to ${makeHashedPassword.name}`, { reason: newHashedPassword.reason });
    return makeAppError();
  }

  const storeAccountResult = isDemoSession(reqSession)
    ? undefined
    : storeAccount(storage, accountId, { ...account, hashedPassword: newHashedPassword });

  if (isErr(storeAccountResult)) {
    logError(si`Failed to ${storeAccount.name}`, {
      reason: storeAccountResult.reason,
      accountId: accountId.value,
      newHash: newHashedPassword.value,
    });
    return makeAppError();
  }

  sendPasswordChangeInformationEmail(account.email, settings, env);

  return makeSuccess();
};

async function sendPasswordChangeInformationEmail(email: EmailAddress, settings: AppSettings, env: AppEnv) {
  const emailContent = {
    subject: 'Please note FeedSubscription passsword change',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Please note that the account password at FeedSubscription.com
      has been changed.</p>

      <p>Have a nice day.</p>
    `),
  };

  return await sendEmail(settings.fullEmailAddress, email, settings.fullEmailAddress.emailAddress, emailContent, env);
}

function makePasswordChangeRequest(data: unknown | PasswordChangeRequestData): Result<PasswordChangeRequest> {
  return makeValues<PasswordChangeRequest>(data, {
    currentPassword: makePassword,
    newPassword: makePassword,
  });
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
    logError(si`Failed to ${storeEmailChangeRequestSecret.name}`, { reason: storeResult.reason });
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
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Please confirm FeedSubscription.com email change by clicking the link below:</p>

      <p><a href="${confirmationLink.toString()}">Yes, I confirm email change</a>.</p>

      <p>NOTE: This link ☝️ expires in ${humanConfirmationSecretLifetime}.</p>

      <p>If you did not initiate an account email change, please ignore this message.</p>

      <p>Have a nice day.</p>
    `),
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

// TODO: Add api test
export const deleteAccountWithPassword: AppRequestHandler = async function deleteAccountWithPassword(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: deleteAccountWithPassword.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const request = makeDeleteAccountRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makeDeleteAccountRequest.name}`, { reason: request.reason, reqBody });
    return makeInputError(request.reason, request.field);
  }

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason, accountId: accountId.value });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logWarning('Account to load not found', { accountId: accountId.value });
    return makeAppError();
  }

  const currentHashedPassword = hash(request.password.value, settings.hashingSalt);

  if (currentHashedPassword !== account.hashedPassword.value) {
    return makeInputError<keyof DeleteAccountRequest>('Password doesn’t match', 'password');
  }

  if (isSubscriptionPlan(account.planId)) {
    const stripe = makeStripe(env.STRIPE_SECRET_KEY);
    const { email } = account;
    const subscription = await cancelCustomerSubscription(stripe, email);

    if (isErr(subscription)) {
      logError(si`Failed to ${cancelCustomerSubscription.name}`, { reason: subscription.reason, email: email.value });
      return makeAppError();
    }

    logInfo(si`Succeeded to ${cancelCustomerSubscription.name}`, {
      email: email.value,
      subscriptionId: subscription.id,
    });
  }

  const isDemoAccount = isDemoSession(reqSession);
  const deleteAccountResult = isDemoAccount ? undefined : deleteAccount(storage, accountId);

  if (isErr(deleteAccountResult)) {
    logError(si`Failed to ${deleteAccount.name}`, { reason: deleteAccountResult.reason, accountId: accountId.value });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logWarning('Account to delete not found', { accountId: accountId.value });
    return makeAppError();
  }

  deinitSession(reqSession);

  if (!isDemoAccount) {
    logInfo('Account deleted', { account });
    sendAccountDeletionConfirmationEmail(account.email, settings, env);
  }

  const maybeUnsetDemoCookie = isDemoAccount ? [unsetDemoCookie] : [];
  const cookies = [disablePrivateNavbarCookie, ...maybeUnsetDemoCookie];

  return makeSuccess('Success', {}, {}, cookies);
};

function sendAccountDeletionConfirmationEmail(accountEmail: EmailAddress, settings: AppSettings, env: AppEnv) {
  const emailContent = {
    subject: 'FeedSubscription account deletion confirmation',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>At your request, your account at FeedSubscription.com has been deleted.</p>

      <p>If you would like to share the reason for deleting the account, we’d really appreciate it.
      You can reply just to this email.</p>

      <p>Have a nice day.</p>
    `),
  };

  return sendEmail(settings.fullEmailAddress, accountEmail, settings.fullEmailAddress.emailAddress, emailContent, env);
}

// TODO: Add api test
export const requestAccountPlanChange: AppRequestHandler = async function requestAccountPlanChange(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: requestAccountPlanChange.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  if (isDemoSession(reqSession)) {
    const logData = {};
    const responseData: PlanChangeResponseData = { clientSecret: 'demo account' };

    return makeSuccess('Success', logData, responseData);
  }

  const { accountId } = session;
  const request = makePlanChangeRequest(reqBody);

  if (isErr(request)) {
    logWarning(si`Failed to ${makePlanChangeRequest.name}`, { reason: request.reason, reqBody });
    return makeInputError(request.reason, request.field);
  }

  if (request.planId === PlanId.SDE) {
    logWarning('Attemtping to change plan to SDE', { accountId: accountId.value });
    return makeInputError('Switching to SDE Plan is done by hand', 'planId' as keyof PlanChangeRequestData);
  }

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason, accountId: accountId.value });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logError('Account not found', { accountId: accountId.value });
    return makeAppError();
  }

  const { email } = account;
  const oldPlanId = account.planId;
  const newPlanId = request.planId;

  if (newPlanId === oldPlanId) {
    logWarning('Plan did not change', { oldPlanId, newPlanId });
    return makeInputError<keyof PlanChangeRequest>('Plan did not change', 'planId');
  }

  const stripe = makeStripe(env.STRIPE_SECRET_KEY);
  const changingFromPaidPlanToFree = request.planId === PlanId.Free;
  const changingFromOnePaidPlanToAnother = oldPlanId !== PlanId.Free;
  let clientSecret: string;

  if (changingFromPaidPlanToFree) {
    const cancelResult = await cancelCustomerSubscription(stripe, email);

    if (isErr(cancelResult)) {
      logError(si`Failed to ${cancelCustomerSubscription.name}`, {
        reason: cancelResult.reason,
        email: email.value,
      });
      return makeAppError();
    }

    clientSecret = '';
  } else if (changingFromOnePaidPlanToAnother) {
    const changeResult = await changeCustomerSubscription(stripe, email, request.planId);

    if (isErr(changeResult)) {
      logError(si`Failed to ${changeCustomerSubscription.name}`, {
        reason: changeResult.reason,
        email: email.value,
        planId: request.planId,
      });
      return makeAppError();
    }

    clientSecret = changeResult.value;
  } else {
    // changing from Free to a paid plan
    const createResult = await createCustomerWithSubscription(stripe, email, request.planId);

    if (isErr(createResult)) {
      logError(si`Failed to ${createCustomerWithSubscription.name}`, {
        reason: createResult.reason,
        accountId: accountId.value,
        planId: request.planId,
      });
      return makeAppError();
    }

    clientSecret = createResult.value;
  }

  const oldPlanTitle = Plans[account.planId].title;
  const newPlanTitle = Plans[request.planId].title;
  const storeAccountResult = storeAccount(storage, accountId, {
    ...account,
    planId: request.planId,
  });

  if (isErr(storeAccountResult)) {
    logError(si`Failed to ${storeAccount.name}`, {
      reason: storeAccountResult.reason,
      accountId: accountId.value,
      planId: request.planId,
    });
    return makeAppError();
  }

  sendPlanChangeInformationEmail(oldPlanTitle, newPlanTitle, email, settings, env);

  const logData = {};
  const responseData: PlanChangeResponseData = { clientSecret };

  return makeSuccess('Success', logData, responseData);
};

function makePlanChangeRequest(data: unknown | PlanChangeRequestData): Result<PlanChangeRequest> {
  return makeValues<PlanChangeRequest>(data, { planId: makePlanId });
}

async function sendPlanChangeInformationEmail(
  oldPlanTitle: string,
  newPlanTitle: string,
  email: EmailAddress,
  settings: AppSettings,
  env: AppEnv
) {
  const emailContent = {
    subject: 'Please note FeedSubscription plan change',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Please note that your plan at FeedSubscription.com has been
      changed from <b>${oldPlanTitle}</b> to <b>${newPlanTitle}</b>.</p>

      <p>Have a nice day.</p>
    `),
  };

  return await sendEmail(settings.fullEmailAddress, email, settings.fullEmailAddress.emailAddress, emailContent, env);
}

function makeDeleteAccountRequest(data: unknown | DeleteAccountRequestData): Result<DeleteAccountRequest> {
  return makeValues<DeleteAccountRequest>(data, { password: makePassword });
}
