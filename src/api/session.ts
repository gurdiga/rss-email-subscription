import { AccountId, isAccountNotFound, makeAccountId } from '../domain/account';
import { loadAccount } from '../domain/account-storage';
import { demoAccountEmail } from '../domain/demo-account';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { AppStorage } from '../domain/storage';
import { makeDate } from '../shared/date-utils';
import { Err, getErrorMessage, hasKind, isErr, makeErr, makeValues, Result } from '../shared/lang';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { sessionCookieName } from './app-cookie';
import { App } from './init-app';

const session = require('express-session');
const FileStore = require('session-file-store')(session);

export type ReqSession = ReturnType<typeof session>;

export const isSessionCookieRolling = true;

export function makeExpressSession({ env, settings }: App): ReqSession {
  const store = new FileStore({
    path: makePath(env.DATA_DIR_ROOT, 'sessions'),
  });

  return session({
    name: sessionCookieName,
    store,
    secret: settings.hashingSalt,
    resave: false,
    // Anonymous requests that write nothing to the session leave no file behind.
    // Saving them let any unauthenticated flood — including one the rate limiter
    // answers with a 429, since this middleware runs first — put a file per
    // request on the volume, which the hourly reap then reads back one by one.
    saveUninitialized: false,
    rolling: isSessionCookieRolling,
  });
}

export interface SessionFields {
  accountId: unknown | AccountId;
  email: unknown | EmailAddress;
  passwordChangedAt: unknown | Date;
  works: unknown | boolean;
}

export type SessionFieldName = keyof SessionFields;

export function storeSessionValue(
  reqSession: ReqSession,
  name: SessionFieldName,
  value: SessionFields[typeof name]
): void {
  reqSession[name] = value;
}

export function deleteSessionValue(reqSession: ReqSession, name: SessionFieldName): void {
  delete reqSession[name];
}

export const sessionCookieMaxage = 2 * 24 * 3600 * 1000;

function setSessionConfig(reqSession: ReqSession): void {
  reqSession.cookie.maxAge = sessionCookieMaxage;
  reqSession.cookie.sameSite = 'strict';

  // A client only ever sends this cookie back over HTTPS, since nginx redirects
  // every plain-HTTP request in both prod and local dev — but Express itself still
  // needs to agree the current request is HTTPS (via the trust-proxy setting in
  // server.ts and nginx's X-Forwarded-Proto) before it will issue a *fresh*
  // Secure-flagged cookie, e.g. on login or session regeneration. Without that,
  // Express silently drops the Set-Cookie instead of sending one it doesn't
  // believe the connection can carry.
  reqSession.cookie.secure = true;
}

// Reads the account's current passwordChangedAt rather than taking it as a
// parameter, so every caller — including one that just wrote a new password
// moments earlier — gets the value actually on disk instead of a snapshot
// that might predate that write.
export function initSession(
  storage: AppStorage,
  reqSession: ReqSession,
  accountId: AccountId,
  email: EmailAddress
): Result<void> {
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return makeErr(si`Failed to ${loadAccount.name}: ${account.reason}`);
  }

  if (isAccountNotFound(account)) {
    return makeErr('Account not found when initializing session');
  }

  storeSessionValue(reqSession, 'accountId', accountId.value);
  storeSessionValue(reqSession, 'email', email.value);
  storeSessionValue(reqSession, 'passwordChangedAt', account.passwordChangedAt.toISOString());
  setSessionConfig(reqSession);
}

export function clearSessionFields(reqSession: ReqSession): void {
  deleteSessionValue(reqSession, 'accountId');
  deleteSessionValue(reqSession, 'email');
  deleteSessionValue(reqSession, 'passwordChangedAt');
}

// For an explicit, terminal logout (the caller's response is being built right
// after this runs, nothing downstream in the same request reuses reqSession).
// destroy() detaches req.session synchronously, so a mid-request revocation that a
// later handler in the *same* request still needs to write into — see
// invalidateSessionIfPasswordChanged — must use clearSessionFields instead: writing
// into a session object destroy() already detached from req never gets saved.
export function deinitSession(reqSession: ReqSession): Promise<Result<void>> {
  clearSessionFields(reqSession);

  return new Promise((resolve) => {
    reqSession.destroy((err: unknown) => {
      resolve(err ? makeErr(si`Failed to destroy session: ${getErrorMessage(err)}`) : undefined);
    });
  });
}

export interface AuthenticatedSession extends Pick<SessionFields, 'accountId' | 'email' | 'passwordChangedAt'> {
  kind: 'AuthenticatedSession';
  accountId: AccountId;
  email: EmailAddress;
  passwordChangedAt: Date;
}

export function isAuthenticatedSession(x: any): x is AuthenticatedSession {
  return hasKind(x, 'AuthenticatedSession');
}
export interface UnauthenticatedSession {
  kind: 'UnauthenticatedSession';
  err: Err;
}

export function checkSession(reqSession: unknown): AuthenticatedSession | UnauthenticatedSession {
  type AuthenticatedSessionValues = Omit<AuthenticatedSession, 'kind'>;
  const values = makeValues<AuthenticatedSessionValues>(reqSession, {
    accountId: makeAccountId,
    email: makeEmailAddress,
    passwordChangedAt: makeDate,
  });

  if (isErr(values)) {
    return { kind: 'UnauthenticatedSession', err: values };
  }

  return { kind: 'AuthenticatedSession', ...values };
}

export function isDemoSession(reqSession: unknown): boolean {
  const session = checkSession(reqSession);

  return isAuthenticatedSession(session) && session.email.value === demoAccountEmail;
}
