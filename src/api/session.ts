import { AccountId, makeAccountId } from '../domain/account';
import { hasKind, isErr, isObject } from '../shared/lang';
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
  works: boolean;
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

export function initSession(reqSession: ReqSession, accountId: AccountId): void {
  storeSessionValue(reqSession, 'accountId', accountId.value);
  setSessionConfig(reqSession);
}

export function deinitSession(reqSession: ReqSession): void {
  deleteSessionValue(reqSession, 'accountId');
}

export interface AuthenticatedSession extends Pick<SessionFields, 'accountId'> {
  kind: 'AuthenticatedSession';
  accountId: AccountId;
}

export function isAuthenticatedSession(x: any): x is AuthenticatedSession {
  return hasKind(x, 'AuthenticatedSession');
}
export interface UnauthenticatedSession {
  kind: 'UnauthenticatedSession';
}

export function checkSession(reqSession: unknown): AuthenticatedSession | UnauthenticatedSession {
  if (!isObject(reqSession)) {
    return { kind: 'UnauthenticatedSession' };
  }

  if (!('accountId' in reqSession) || typeof reqSession.accountId !== 'string') {
    return { kind: 'UnauthenticatedSession' };
  }

  const accountId = makeAccountId(reqSession.accountId);

  if (isErr(accountId)) {
    return { kind: 'UnauthenticatedSession' };
  }

  return {
    kind: 'AuthenticatedSession',
    accountId,
  };
}
