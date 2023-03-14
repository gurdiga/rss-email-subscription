import { AccountId, makeAccountId } from '../domain/account';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { Err, hasKind, isErr, makeValues } from '../shared/lang';
import { makePath } from '../shared/path-utils';
import { App } from './init-app';

const session = require('express-session');
const FileStore = require('session-file-store')(session);

export type ReqSession = ReturnType<typeof session>;

export function makeExpressSession({ env, settings }: App): ReqSession {
  const store = new FileStore({
    path: makePath(env.DATA_DIR_ROOT, 'sessions'),
  });

  return session({
    store,
    secret: settings.hashingSalt,
    resave: false,
    saveUninitialized: true,
    rolling: true,
  });
}

export interface SessionFields {
  accountId: unknown | AccountId;
  email: unknown | EmailAddress;
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

function setSessionConfig(reqSession: ReqSession): void {
  reqSession.cookie.maxAge = 2 * 24 * 3600 * 1000;
  reqSession.cookie.sameSite = 'strict';
}

export function initSession(reqSession: ReqSession, accountId: AccountId, email: EmailAddress): void {
  storeSessionValue(reqSession, 'accountId', accountId.value);
  storeSessionValue(reqSession, 'email', email.value);
  setSessionConfig(reqSession);
}

export function deinitSession(reqSession: ReqSession): void {
  deleteSessionValue(reqSession, 'accountId');
  deleteSessionValue(reqSession, 'email');
}

export interface AuthenticatedSession extends Pick<SessionFields, 'accountId' | 'email'> {
  kind: 'AuthenticatedSession';
  accountId: AccountId;
  email: EmailAddress;
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
  });

  if (isErr(values)) {
    return { kind: 'UnauthenticatedSession', err: values };
  }

  return { kind: 'AuthenticatedSession', ...values };
}
