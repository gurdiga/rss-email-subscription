import { escapeHtml, htmlBody } from '../app/email-sending/email-content';
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
import { deleteAccount, loadAccount, setAccountEmail, storeAccount } from '../domain/account-storage';
import { AppSettings } from '../domain/app-settings';
import {
  accountControlSecretKinds,
  allConfirmationSecretKinds,
  ConfirmationSecret,
  EmailChangeRequestSecretData,
  humanConfirmationSecretLifetime,
  isConfirmationSecretNotFound,
  isIssuedForAccount,
  makeConfirmationSecret,
  makeEmailChangeRequestSecretData,
  makeRandomConfirmationSecret,
  makeConfirmationLink,
} from '../domain/confirmation-secrets';
import {
  deleteConfirmationSecret,
  loadConfirmationSecretOfKind,
  revokeAccountSecrets,
  storeConfirmationSecret,
} from '../domain/confirmation-secrets-storage';
import { demoAccountEmail, demoAccountPassword } from '../domain/demo-account';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { HashedPassword, hashPassword, verifyPassword } from '../domain/hashed-password';
import { PagePath } from '../domain/page-path';
import { makePassword } from '../domain/password';
import { isSubscriptionPlan, makePlanId, PlanId, Plans } from '../domain/plan';
import { AppStorage } from '../domain/storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { isErr, makeErr, makeValues, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { clearSessionCookie, disablePrivateNavbarCookie, unsetDemoCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { AppEnv } from './init-app';
import { sendPlanChangeInformationEmail } from './plan-change-email';
import { checkSession, deinitSession, initSession, isAuthenticatedSession, isDemoSession } from './session';
import {
  cancelCustomerSubscription,
  changeCustomerSubscription,
  createCustomerWithSubscription,
  getPaymentMethodUpdateTransaction,
  isPaddleCustomerTaken,
  makeContactSupportError,
  removeScheduledCancellation,
  updatePaddleCustomerEmail,
  isNothingToCancel,
  loadCardDescription,
  makePaddle,
} from './payment-integration';

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

    cardDescription = loadedDescription ?? '';
  }

  const logData = {};
  const responseData: UiAccount = {
    email: account.email.value,
    planId: account.planId,
    isAdmin: !!account.isAdmin,
    cardDescription,
    pendingCancellationAt: account.pendingCancellationAt?.toISOString(),
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
  const data = loadConfirmationSecretOfKind<EmailChangeRequestSecretData>(
    storage,
    secret,
    'EmailChangeRequestSecretData'
  );

  if (isErr(data)) {
    logError(si`Failed to ${loadConfirmationSecretOfKind.name}`, { reason: data.reason });
    return makeAppError();
  }

  if (isConfirmationSecretNotFound(data)) {
    logWarning('Confirmation secret not found', { confirmationSecret: secret.value });
    return makeInputError('Confirmation has already been confirmed');
  }

  const { accountId, newEmail } = data;
  const currentAccount = loadAccount(storage, accountId);

  if (isErr(currentAccount)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: currentAccount.reason, accountId: accountId.value });
    return makeAppError();
  }

  if (isAccountNotFound(currentAccount)) {
    logError(si`Account to set email not found`, { accountId: accountId.value });
    return makeAppError();
  }

  if (!isIssuedForAccount(data, currentAccount)) {
    logWarning('Email change secret issued for another account at this ID', { accountId: accountId.value });
    deleteConfirmationSecret(storage, secret);
    return makeInputError('Confirmation has already been confirmed');
  }

  // Whether to skip the real mutation is decided from the token's own target account,
  // not from whatever session happens to redeem it: the link is mailed to newEmail and
  // can be opened from any browser, so a session-based check is trivially bypassed by
  // opening it logged out.
  const isProtectedDemoAccount = currentAccount.email.value === demoAccountEmail;
  const oldEmail = isProtectedDemoAccount
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

  // The account has moved to the ID of its new address. Secrets still filed under
  // the old ID would otherwise redeem against whoever registers that address next.
  // The change has committed, so a failure here is logged rather than reported.
  const revokeResult = isProtectedDemoAccount
    ? undefined
    : revokeAccountSecrets(storage, accountId, allConfirmationSecretKinds);

  if (isErr(revokeResult)) {
    logError(si`Failed to ${revokeAccountSecrets.name}: ${revokeResult.reason}`, { accountId: accountId.value });
  }

  // Best effort: the account no longer depends on the Paddle customer’s email, but
  // receipts go to it. Expected to fail when an orphaned customer already holds the
  // new address; that one is logged for cleanup by hand.
  if (!isProtectedDemoAccount && currentAccount.paddleCustomerId) {
    const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);
    const updateResult = await updatePaddleCustomerEmail(paddle, currentAccount.paddleCustomerId, newEmail);

    if (isErr(updateResult)) {
      logError(si`Failed to ${updatePaddleCustomerEmail.name}: ${updateResult.reason}`, {
        paddleCustomerId: currentAccount.paddleCustomerId.value,
      });
    }
  }

  const deinitResult = await deinitSession(reqSession);

  // The email change itself already committed above, so a deinitSession failure
  // here doesn't get to veto it — only the post-change forced-relogin step failed.
  // Still surface it at error level and clear the cookie regardless, so the browser
  // stops presenting one session-file-store can no longer find.
  if (isErr(deinitResult)) {
    logError(si`Failed to ${deinitSession.name}`, { reason: deinitResult.reason });
  }

  sendEmailChangeInformationEmail(oldEmail, settings, env, newEmail);

  const logData = {
    newEmail: newEmail.value,
    accountId: accountId.value,
  };

  return makeSuccess('Confirmed email change', logData, undefined, [clearSessionCookie]);
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
      has been changed from <b>${escapeHtml(oldEmail.value)}</b> to <b>${escapeHtml(newEmail.value)}</b>.</p>

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

  // The demo credentials are published in demo-account.ts, so this endpoint is
  // authenticated in name only. Answer before loading the account and verifying:
  // the demo password is a known constant, so comparing it gives the same answer
  // that verifyPassword would, without spending a scrypt hash per public request.
  // A demo session stores nothing, so there is nothing else to do.
  if (isDemoSession(reqSession)) {
    if (request.currentPassword.value !== demoAccountPassword) {
      return makeInputError<keyof PasswordChangeRequest>('Current password doesn’t match', 'currentPassword');
    }

    if (request.currentPassword.value === request.newPassword.value) {
      return makeInputError<keyof PasswordChangeRequest>(
        'New password can’t be the same as the old one',
        'newPassword'
      );
    }

    return makeSuccess();
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

  const verification = await verifyPassword(
    request.currentPassword.value,
    account.hashedPassword,
    settings.hashingSalt
  );

  if (!verification.isMatch || !account.hashedPassword) {
    return makeInputError<keyof PasswordChangeRequest>('Current password doesn’t match', 'currentPassword');
  }

  if (request.currentPassword.value === request.newPassword.value) {
    return makeInputError<keyof PasswordChangeRequest>('New password can’t be the same as the old one', 'newPassword');
  }

  const newHashedPassword = await hashPassword(request.newPassword.value);
  const storeAccountResult = storeNewPassword(storage, accountId, account.hashedPassword, newHashedPassword);

  if (isErr(storeAccountResult)) {
    // The hash itself is deliberately not logged: the logger only masks keys containing
    // "password", so it would go to disk in the clear.
    logError(si`Failed to ${storeNewPassword.name}`, {
      reason: storeAccountResult.reason,
      accountId: accountId.value,
    });
    return makeAppError();
  }

  // A reset link or a pending email change issued before this would outlive the
  // change made to shut out whoever holds it. The change has committed, so a failure
  // here is logged rather than reported.
  const revokeResult = revokeAccountSecrets(storage, accountId, accountControlSecretKinds);

  if (isErr(revokeResult)) {
    logError(si`Failed to ${revokeAccountSecrets.name}: ${revokeResult.reason}`, { accountId: accountId.value });
  }

  // Refreshes this session's own passwordChangedAt snapshot: every session is compared
  // against the account's current value on the next request, and without this the caller
  // would get logged out by the very change they just made.
  const sessionInitResult = initSession(storage, reqSession, accountId, account.email);

  if (isErr(sessionInitResult)) {
    logError(si`Failed to ${initSession.name}`, { reason: sessionInitResult.reason, accountId: accountId.value });
    return makeAppError();
  }

  sendPasswordChangeInformationEmail(account.email, settings, env);

  return makeSuccess();
};

// Hashing the new password yields to the event loop, so the account is re-read here and
// written only if its stored hash is still the one whose plaintext the caller verified.
// Writing the pre-hash snapshot would silently revert a plan change, email change or
// password reset that completed while the hash was being computed.
function storeNewPassword(
  storage: AppStorage,
  accountId: AccountId,
  verifiedHashedPassword: HashedPassword,
  newHashedPassword: HashedPassword
): Result<void> {
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return account;
  }

  if (isAccountNotFound(account)) {
    return makeErr('Account not found when storing the new password');
  }

  if (account.hashedPassword?.value !== verifiedHashedPassword.value) {
    return makeErr('Stored password changed while hashing the new one');
  }

  return storeAccount(storage, accountId, {
    ...account,
    hashedPassword: newHashedPassword,
    passwordChangedAt: new Date(),
  });
}

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

  // The demo account's email never actually changes, so the only effect of
  // going on would be mailing an address a stranger typed.
  if (isDemoSession(reqSession)) {
    logWarning('Refused email change for the demo account');
    return makeInputError<keyof EmailChangeRequestData>('The demo account’s email can’t be changed', 'newEmail');
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

  const confirmationSecret = makeRandomConfirmationSecret();
  const sendEmailResult = await sendEmailChangeConfirmationEmail(newEmail, confirmationSecret, settings, env);

  if (isErr(sendEmailResult)) {
    logError(si`Failed to ${sendEmailChangeConfirmationEmail.name}`, { reason: sendEmailResult.reason });
    return makeAppError();
  }

  const storeResult = storeEmailChangeRequestSecret(
    accountId,
    account.creationTimestamp,
    newEmail,
    confirmationSecret,
    storage
  );

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
  const confirmationLink = makeConfirmationLink(env.DOMAIN_NAME, PagePath.emailChangeConfirmation, confirmationSecret);

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

function storeEmailChangeRequestSecret(
  accountId: AccountId,
  accountCreatedAt: Date,
  newEmail: EmailAddress,
  confirmationSecret: ConfirmationSecret,
  storage: AppStorage
) {
  const confirmationSecretData = makeEmailChangeRequestSecretData(accountId, accountCreatedAt, newEmail);

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

  // As in requestAccountPasswordChange: the demo credentials are published, so
  // answer before loading the account, verifying, or calling Paddle — a demo
  // deletion cancels no subscription and removes nothing. The session and cookies
  // still clear, so the demo behaves like the real thing.
  if (isDemoSession(reqSession)) {
    if (request.password.value !== demoAccountPassword) {
      return makeInputError<keyof DeleteAccountRequest>('Password doesn’t match', 'password');
    }

    const deinitResult = await deinitSession(reqSession);

    if (isErr(deinitResult)) {
      logError(si`Failed to ${deinitSession.name}`, { reason: deinitResult.reason });
    }

    return makeSuccess('Success', {}, {}, [disablePrivateNavbarCookie, clearSessionCookie, unsetDemoCookie]);
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

  const verification = await verifyPassword(request.password.value, account.hashedPassword, settings.hashingSalt);

  if (!verification.isMatch || !account.hashedPassword) {
    return makeInputError<keyof DeleteAccountRequest>('Password doesn’t match', 'password');
  }

  // Deleting without cancelling would leave Paddle billing a customer who no longer
  // has an account here, so a failure stops the deletion rather than being logged.
  if (isSubscriptionPlan(account.planId)) {
    const { email, paddleCustomerId } = account;

    if (!paddleCustomerId) {
      logError('No Paddle customer linked to a paid account; not deleting', { accountId: accountId.value });
      return makeContactSupportError(settings);
    }

    const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);
    const cancelResult = await cancelCustomerSubscription(paddle, paddleCustomerId);

    if (isErr(cancelResult)) {
      logError(si`Failed to ${cancelCustomerSubscription.name}; not deleting`, {
        reason: cancelResult.reason,
        email: email.value,
      });
      return makeAppError('We couldn’t cancel your subscription. Please try again, or contact support.');
    } else if (isNothingToCancel(cancelResult)) {
      logInfo('No Paddle subscription to cancel for account deletion', { email: email.value });
    } else {
      logInfo(si`Succeeded to ${cancelCustomerSubscription.name}`, { email: email.value });
    }
  }

  // Verifying and cancelling both yield to the event loop. If the owner reset the
  // password meanwhile, the one this request verified no longer authorizes deletion.
  const currentAccount = loadAccount(storage, accountId);

  if (isErr(currentAccount) || isAccountNotFound(currentAccount)) {
    logWarning('Account changed or disappeared during deletion', { accountId: accountId.value });
    return makeAppError();
  }

  if (currentAccount.hashedPassword?.value !== account.hashedPassword.value) {
    logWarning('Password changed during deletion', { accountId: accountId.value });
    return makeInputError<keyof DeleteAccountRequest>('Password doesn’t match', 'password');
  }

  const deleteAccountResult = deleteAccount(storage, accountId);

  if (isErr(deleteAccountResult)) {
    logError(si`Failed to ${deleteAccount.name}`, { reason: deleteAccountResult.reason, accountId: accountId.value });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logWarning('Account to delete not found', { accountId: accountId.value });
    return makeAppError();
  }

  const deinitResult = await deinitSession(reqSession);

  // The account is already gone from storage at this point, so a deinitSession
  // failure can't leave anyone authenticated as it — every handler already treats
  // a missing account as unauthenticated. Report it and clear the cookie anyway.
  if (isErr(deinitResult)) {
    logError(si`Failed to ${deinitSession.name}`, { reason: deinitResult.reason });
  }

  logInfo('Account deleted', { account });
  sendAccountDeletionConfirmationEmail(account.email, settings, env);

  return makeSuccess('Success', {}, {}, [disablePrivateNavbarCookie, clearSessionCookie]);
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
export const requestPaymentMethodUpdate: AppRequestHandler = async function requestPaymentMethodUpdate(
  reqId,
  _reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: requestPaymentMethodUpdate.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated');
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logWarning('Account not found');
    return makeNotAuthenticatedError();
  }

  if (!account.paddleCustomerId) {
    logError('No Paddle customer linked to the account', { accountId: accountId.value });
    return makeContactSupportError(settings);
  }

  const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);
  const transaction = await getPaymentMethodUpdateTransaction(paddle, account.paddleCustomerId);

  if (isErr(transaction)) {
    logError(si`Failed to ${getPaymentMethodUpdateTransaction.name}`, { reason: transaction.reason });
    return makeAppError();
  }

  return makeSuccess('Payment method update transaction', {}, { paymentToken: transaction.value });
};

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
    const responseData: PlanChangeResponseData = { paymentToken: 'demo account' };

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

  const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);
  const changingFromPaidPlanToFree = request.planId === PlanId.Free;
  const changingFromOnePaidPlanToAnother = oldPlanId !== PlanId.Free;
  const { paddleCustomerId } = account;

  if (changingFromPaidPlanToFree) {
    if (!paddleCustomerId) {
      logError('No Paddle customer linked to a paid account', { accountId: accountId.value, oldPlanId });
      return makeContactSupportError(settings);
    }

    // Cancel in Paddle with next_billing_period; local plan stays paid until
    // subscription.canceled webhook fires at period end.
    const cancelResult = await cancelCustomerSubscription(paddle, paddleCustomerId);

    if (isErr(cancelResult)) {
      logError(si`Failed to ${cancelCustomerSubscription.name}`, {
        reason: cancelResult.reason,
        email: email.value,
      });
      return makeAppError();
    }

    // Downgrading a paid plan with no subscription behind it means the local plan and
    // Paddle disagree; letting it report success would leave the account paid forever,
    // since the plan only drops on the subscription.canceled webhook.
    if (isNothingToCancel(cancelResult)) {
      logError('No Paddle subscription to cancel on plan downgrade', { email: email.value, oldPlanId });
      return makeAppError();
    }

    const { effectiveAt } = cancelResult;
    const storeResult = storePendingCancellation(storage, accountId, effectiveAt);

    // Paddle has scheduled it either way, so this only costs the account page its notice.
    if (isErr(storeResult)) {
      logError(si`Failed to ${storePendingCancellation.name}`, { reason: storeResult.reason, email: email.value });
    }

    const responseData: PlanChangeResponseData = { paymentToken: '', pendingCancellationAt: effectiveAt.toISOString() };

    return makeSuccess('Success', {}, responseData);
  } else if (changingFromOnePaidPlanToAnother) {
    if (!paddleCustomerId) {
      logError('No Paddle customer linked to a paid account', { accountId: accountId.value, oldPlanId });
      return makeContactSupportError(settings);
    }

    const changeResult = await changeCustomerSubscription(paddle, paddleCustomerId, request.planId);

    if (isErr(changeResult)) {
      logError(si`Failed to ${changeCustomerSubscription.name}`, {
        reason: changeResult.reason,
        email: email.value,
        planId: request.planId,
      });
      return makeAppError();
    }
  } else {
    // Changing from Free to a paid plan: create a checkout transaction and
    // defer the plan upgrade to the transaction.completed webhook.
    const createResult = await createCustomerWithSubscription(paddle, storage, accountId, request.planId);

    if (isErr(createResult)) {
      logError(si`Failed to ${createCustomerWithSubscription.name}`, {
        reason: createResult.reason,
        accountId: accountId.value,
        planId: request.planId,
      });
      return makeAppError();
    }

    if (isPaddleCustomerTaken(createResult)) {
      logError('Refusing to adopt the Paddle customer for this email', {
        reason: createResult.reason,
        accountId: accountId.value,
      });
      return makeContactSupportError(settings);
    }

    return makeSuccess('Success', {}, { paymentToken: createResult.value });
  }

  // Paid-to-paid: commit the new plan immediately (no checkout required). The Paddle
  // call yielded, so re-read rather than write back the snapshot from before it:
  // that would revert a password reset or revocation which landed in the meantime.
  const currentAccount = loadAccount(storage, accountId);

  if (isErr(currentAccount) || isAccountNotFound(currentAccount)) {
    logError('Account changed or disappeared after the Paddle plan change', {
      accountId: accountId.value,
      planId: request.planId,
    });
    return makeAppError();
  }

  const oldPlanTitle = Plans[account.planId].title;
  const newPlanTitle = Plans[request.planId].title;
  // A pending downgrade to Free was lifted by the change, so its notice goes too.
  const storeAccountResult = storeAccount(storage, accountId, {
    ...currentAccount,
    pendingCancellationAt: undefined,
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

  return makeSuccess('Success', {}, { paymentToken: '' });
};

export const keepAccountPlan: AppRequestHandler = async function keepAccountPlan(
  reqId,
  _reqBody,
  _reqParams,
  reqSession,
  { storage, settings, env }
) {
  const { logWarning, logError, logInfo } = makeCustomLoggers({ module: keepAccountPlan.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  if (isDemoSession(reqSession)) {
    return makeSuccess('Success');
  }

  const { accountId } = session;
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason, accountId: accountId.value });
    return makeAppError();
  }

  if (isAccountNotFound(account)) {
    logWarning('Account not found', { accountId: accountId.value });
    return makeNotAuthenticatedError();
  }

  if (!account.pendingCancellationAt) {
    return makeInputError('Your plan isn’t scheduled to end.');
  }

  if (!account.paddleCustomerId) {
    logError('No Paddle customer linked to a paid account', { accountId: accountId.value });
    return makeContactSupportError(settings);
  }

  const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);
  const removeResult = await removeScheduledCancellation(paddle, account.paddleCustomerId);

  if (isErr(removeResult)) {
    logError(si`Failed to ${removeScheduledCancellation.name}`, { reason: removeResult.reason });
    return makeAppError();
  }

  // Its webhook hasn't arrived yet, and when it does it moves the account to Free.
  if (isNothingToCancel(removeResult)) {
    logWarning('No live subscription to keep', { accountId: accountId.value });
    return makeInputError('This plan has already ended, so it can’t be kept. Please choose a plan again.');
  }

  const storeResult = storePendingCancellation(storage, accountId, undefined);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storePendingCancellation.name}`, { reason: storeResult.reason });
    return makeAppError();
  }

  logInfo('Kept the plan', { accountId: accountId.value, planId: account.planId });

  return makeSuccess('Your plan continues. 👍');
};

// Re-reads first: the Paddle call that precedes each use yields to the event loop.
function storePendingCancellation(storage: AppStorage, accountId: AccountId, pendingCancellationAt: Date | undefined) {
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return account;
  }

  if (isAccountNotFound(account)) {
    return makeErr('Account not found');
  }

  return storeAccount(storage, accountId, { ...account, pendingCancellationAt });
}

function makePlanChangeRequest(data: unknown | PlanChangeRequestData): Result<PlanChangeRequest> {
  return makeValues<PlanChangeRequest>(data, { planId: makePlanId });
}

function makeDeleteAccountRequest(data: unknown | DeleteAccountRequestData): Result<DeleteAccountRequest> {
  return makeValues<DeleteAccountRequest>(data, { password: makePassword });
}
