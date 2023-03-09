import { makeEmailAddress } from '../domain/email-address-making';
import {
  AccountId,
  AuthenticationResponseData,
  AuthenticationRequest,
  AuthenticationRequestData,
  isAccountNotFound,
} from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount } from '../domain/account-storage';
import { makePassword } from '../domain/password';
import { makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { getTypeName, isErr, isObject, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { App } from './init-app';
import { RequestHandler } from './request-handler';
import { initSession } from './session';
import { enablePrivateNavbarCookie } from './app-cookie';

export const authentication: RequestHandler = async function authentication(
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

  const accountId = checkCredentials(app, request);

  if (isErr(accountId)) {
    return makeInputError(accountId.reason, accountId.field);
  }

  initSession(reqSession, accountId);

  const logData = {};
  const responseData: AuthenticationResponseData = { sessionId: reqSession.id };
  const cookies = [enablePrivateNavbarCookie];

  return makeSuccess('Welcome back!', logData, responseData, cookies);
};

function makeAuthenticationRequest(data: unknown | AuthenticationRequestData): Result<AuthenticationRequest> {
  if (!isObject(data)) {
    return makeErr(si`Invalid request data type: expected [object] but got [${getTypeName(data)}]`);
  }

  const emailKeyName: keyof AuthenticationRequestData = 'email';

  if (!(emailKeyName in data)) {
    return makeErr(si`Invalid request: missing "${emailKeyName}"`, emailKeyName);
  }

  const email = makeEmailAddress(data.email, emailKeyName);

  if (isErr(email)) {
    return email;
  }

  const passwordKeyName: keyof AuthenticationRequestData = 'password';

  if (!(passwordKeyName in data)) {
    return makeErr(si`Invalid request: missing "${passwordKeyName}"`, passwordKeyName);
  }

  const password = makePassword(data.password, passwordKeyName);

  if (isErr(password)) {
    return password;
  }

  return { email, password };
}

function checkCredentials({ settings, storage }: App, request: AuthenticationRequest): Result<AccountId> {
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

  const inputHashedPassword = hash(request.password.value, settings.hashingSalt);
  const storedHashedPassword = account.hashedPassword.value;

  if (inputHashedPassword !== storedHashedPassword) {
    logWarning('Icorrect password', { inputHashedPassword, storedHashedPassword });
    return makeErr('Password doesn’t match… 🤔', 'password');
  }

  logInfo('User logged in');

  return accountId;
}
