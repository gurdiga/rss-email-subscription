import { makeEmailAddress } from '../domain/email-address-making';
import { AccountId, AuthenticationResponseData, AuthenticationRequest, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { HashedPassword, hashPassword, verifyPassword } from '../domain/hashed-password';
import { makePassword } from '../domain/password';
import { AppStorage } from '../domain/storage';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
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
  _reqSession,
  app,
  regenerateSession
) {
  const request = makeAuthenticationRequest(reqBody);

  if (isErr(request)) {
    return makeInputError(request.reason, request.field);
  }

  const checkedCredentials = await checkCredentials(app, request);

  if (isErr(checkedCredentials)) {
    return makeInputError(checkedCredentials.reason, checkedCredentials.field);
  }

  const { accountId, hashedPassword } = checkedCredentials;

  const newReqSession = await regenerateSession();
  const accountAfterRegenerate = loadAccount(app.storage, accountId);

  if (isErr(accountAfterRegenerate) || isAccountNotFound(accountAfterRegenerate)) {
    return makeAppError('Could not find your account');
  }

  if (accountAfterRegenerate.hashedPassword.value !== hashedPassword.value) {
    return makeInputError<keyof AuthenticationRequest>('Password doesn’t match… 🤔', 'password');
  }

  const sessionInitResult = initSession(app.storage, newReqSession, accountId, request.email);

  if (isErr(sessionInitResult)) {
    return makeAppError(sessionInitResult.reason);
  }

  const logData = {};
  const responseData: AuthenticationResponseData = { sessionId: newReqSession.id };

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

interface CheckedCredentials {
  accountId: AccountId;
  hashedPassword: HashedPassword;
}

async function checkCredentials(
  { settings, storage }: App,
  request: AuthenticationRequest
): Promise<Result<CheckedCredentials>> {
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

  // Verifying yields to the event loop (scrypt). Re-read and compare rather than trusting
  // the snapshot: a password change or reset landing in that window must not hand out a
  // session for a credential that no longer applies — initSession reads the account fresh,
  // so such a session would otherwise carry the reset's own passwordChangedAt and look
  // current to every future revocation check.
  const currentAccount = loadAccount(storage, accountId);

  if (isErr(currentAccount) || isAccountNotFound(currentAccount)) {
    logWarning('Account disappeared while verifying password');
    return makeErr('Could not find your account', 'email');
  }

  if (currentAccount.hashedPassword.value !== account.hashedPassword.value) {
    logWarning('Stored password changed while verifying it');
    return makeErr('Password doesn’t match… 🤔', 'password');
  }

  let expectedHashedPassword = account.hashedPassword;

  if (verification.needsRehash && request.email.value !== demoAccountEmail) {
    const rehashed = await rehashPassword(storage, accountId, account.hashedPassword, request.password.value);

    if (rehashed) {
      expectedHashedPassword = rehashed;
    }
  }

  // Rehashing yields too, so a reset can land during it. Returning a hash this login
  // never proved would let the caller's freshness check pass and stamp the session
  // with the reset's own passwordChangedAt. A changed hash may also be a concurrent
  // login's rehash of this same password, which is harmless, so a mismatch is settled
  // by verifying against what is stored now rather than rejected outright.
  const finalAccount = loadAccount(storage, accountId);

  if (isErr(finalAccount) || isAccountNotFound(finalAccount)) {
    logWarning('Account disappeared after rehash');
    return makeErr('Could not find your account', 'email');
  }

  if (finalAccount.hashedPassword.value !== expectedHashedPassword.value) {
    const reverification = await verifyPassword(
      request.password.value,
      finalAccount.hashedPassword,
      settings.hashingSalt
    );

    if (!reverification.isMatch) {
      logWarning('Stored password changed while rehashing it');
      return makeErr('Password doesn’t match… 🤔', 'password');
    }
  }

  logInfo('User logged in');

  return { accountId, hashedPassword: finalAccount.hashedPassword };
}

// Upgrade a password hash to the current algorithm and cost on successful login — either
// from the legacy format or from out-of-date scrypt parameters. A failure here must not
// fail an otherwise-valid login, so it is logged and swallowed.
//
// Hashing yields to the event loop, so the account is re-read afterwards and written
// only if its stored hash is still the one that was verified. Writing a snapshot taken
// before the hash would revert a password reset that completed in the meantime — and
// revert it to the very password the user was resetting away from.
//
// Returns the hash it stored, or undefined when it stored nothing.
async function rehashPassword(
  storage: AppStorage,
  accountId: AccountId,
  verifiedHashedPassword: HashedPassword,
  plainPassword: string
): Promise<HashedPassword | undefined> {
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
    return undefined;
  }

  return rehashed;
}
