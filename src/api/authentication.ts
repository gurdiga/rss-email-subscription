import { makeEmailAddress } from '../domain/email-address-making';
import { AccountId, AuthenticationResponseData, AuthenticationRequest, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { HashedPassword, hashPassword, verifyPassword } from '../domain/hashed-password';
import { makePassword } from '../domain/password';
import { AppStorage } from '../domain/storage';
import { makeInputError, makeSuccess } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, makeValues, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { App } from './init-app';
import { AppRequestHandler } from './app-request-handler';
import { initSession } from './session';
import { enablePrivateNavbarCookie, setDemoCookie } from './app-cookie';
import { demoAccountEmail } from '../domain/demo-account';

export const authentication: AppRequestHandler = async function authentication(
  _reqId,
  reqBody,
  _reqParams,
  reqSession,
  app
) {
  const request = makeAuthenticationRequest(reqBody);

  if (isErr(request)) {
    return makeInputError(request.reason, request.field);
  }

  const accountId = await checkCredentials(app, request);

  if (isErr(accountId)) {
    return makeInputError(accountId.reason, accountId.field);
  }

  initSession(reqSession, accountId, request.email);

  const logData = {};
  const responseData: AuthenticationResponseData = { sessionId: reqSession.id };

  const maybeSetDemoCookie = request.email.value === demoAccountEmail ? [setDemoCookie] : [];
  const cookies = [enablePrivateNavbarCookie, ...maybeSetDemoCookie];

  return makeSuccess('Welcome back!', logData, responseData, cookies);
};

function makeAuthenticationRequest(data: unknown): Result<AuthenticationRequest> {
  return makeValues<AuthenticationRequest>(data, {
    email: makeEmailAddress,
    password: makePassword,
  });
}

async function checkCredentials(
  { settings, storage }: App,
  request: AuthenticationRequest
): Promise<Result<AccountId>> {
  const { logInfo, logWarning, logError } = makeCustomLoggers({
    email: request.email.value,
    module: checkCredentials.name,
  });
  const accountId = getAccountIdByEmail(request.email, settings.hashingSalt);
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return makeErr('Could not find your account', 'email');
  }

  if (isAccountNotFound(account)) {
    logError('Account not found by ID', { accountId: accountId.value });
    return makeErr('Could not find your account', 'email');
  }

  const emailNotConfirmed = !account.confirmationTimestamp;

  if (emailNotConfirmed) {
    logWarning('Email not confirmed on login', { email: account.email.value });

    return makeErr(
      'Please click the registration confirmation link in the email we sent you on registration.',
      'email'
    );
  }

  const verification = await verifyPassword(request.password.value, account.hashedPassword, settings.hashingSalt);

  if (!verification.isMatch) {
    logWarning('Incorrect password');
    return makeErr('Password doesn’t match… 🤔', 'password');
  }

  if (verification.needsRehash && request.email.value !== demoAccountEmail) {
    await rehashPassword(storage, accountId, account.hashedPassword, request.password.value);
  }

  logInfo('User logged in');

  return accountId;
}

// Upgrade a password hash to the current algorithm and cost on successful login — either
// from the legacy format or from out-of-date scrypt parameters. A failure here must not
// fail an otherwise-valid login, so it is logged and swallowed.
//
// Hashing yields to the event loop, so the account is re-read afterwards and written
// only if its stored hash is still the one that was verified. Writing a snapshot taken
// before the hash would revert a password reset that completed in the meantime — and
// revert it to the very password the user was resetting away from.
async function rehashPassword(
  storage: AppStorage,
  accountId: AccountId,
  verifiedHashedPassword: HashedPassword,
  plainPassword: string
): Promise<void> {
  const { logError, logInfo, logWarning } = makeCustomLoggers({
    accountId: accountId.value,
    module: rehashPassword.name,
  });
  const rehashed = await asyncAttempt(() => hashPassword(plainPassword));

  if (isErr(rehashed)) {
    logError('Failed to rehash password on login', { reason: rehashed.reason });
    return;
  }

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name} before storing rehashed password`, { reason: account.reason });
    return;
  }

  if (isAccountNotFound(account)) {
    logWarning('Account disappeared before storing rehashed password');
    return;
  }

  if (account.hashedPassword.value !== verifiedHashedPassword.value) {
    logInfo('Skipped rehash: stored password changed while hashing');
    return;
  }

  const storeResult = storeAccount(storage, accountId, { ...account, hashedPassword: rehashed });

  if (isErr(storeResult)) {
    logError('Failed to store rehashed password on login', { reason: storeResult.reason });
  }
}
