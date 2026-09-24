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

  // A pre-login session ID — anonymous, or authenticated as someone else — must not
  // survive into this one: reusing it would let whoever set it (e.g. by planting a
  // cookie before the victim logs in) ride in on the session this login establishes.
  //
  // regenerateSession() destroys the pre-login session's store record — real disk I/O
  // that yields to the event loop, the same kind of window checkCredentials already
  // guards its own scrypt call against below. Re-check the stored hash is still the
  // one just validated: initSession reads the account fresh, so a password reset
  // landing in this window would otherwise hand out a session that looks current to
  // every future revocation check despite being established with a password that's
  // no longer valid.
  const reqSession = await regenerateSession();
  const accountAfterRegenerate = loadAccount(app.storage, accountId);

  if (isErr(accountAfterRegenerate) || isAccountNotFound(accountAfterRegenerate)) {
    return makeAppError('Could not find your account');
  }

  if (accountAfterRegenerate.hashedPassword.value !== hashedPassword.value) {
    return makeInputError<keyof AuthenticationRequest>('Password doesn’t match… 🤔', 'password');
  }

  const sessionInitResult = initSession(app.storage, reqSession, accountId, request.email);

  if (isErr(sessionInitResult)) {
    return makeAppError(sessionInitResult.reason);
  }

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

  if (verification.needsRehash && request.email.value !== demoAccountEmail) {
    await rehashPassword(storage, accountId, account.hashedPassword, request.password.value);
  }

  logInfo('User logged in');

  // rehashPassword may have just rewritten the stored hash (a format/cost upgrade,
  // same bytes-different-encoding password). Re-read rather than returning the
  // pre-rehash snapshot, so the caller's own post-regeneration freshness check
  // compares against what's actually on disk instead of false-flagging a rehash
  // as if the password itself had changed.
  const finalAccount = loadAccount(storage, accountId);

  if (isErr(finalAccount) || isAccountNotFound(finalAccount)) {
    logWarning('Account disappeared after rehash');
    return makeErr('Could not find your account', 'email');
  }

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
