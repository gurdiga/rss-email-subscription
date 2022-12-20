import { AccountId } from '../domain/account';
import { hasKind, isString } from '../shared/lang';
import { App } from './init-app';

const session = require('express-session');
const FileStore = require('session-file-store')(session);

export type ReqSession = ReturnType<typeof session>;

export function makeExpressSession({ env, settings }: App): ReqSession {
  const store = new FileStore({
    path: `${env.DATA_DIR_ROOT}/sessions`,
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
  storeSessionValue(reqSession, 'accountId', accountId);
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

export function checkSession(reqSession: ReqSession): AuthenticatedSession | UnauthenticatedSession {
  const { accountId } = reqSession;

  if (isString(accountId) && accountId.trim().length > 0) {
    return {
      kind: 'AuthenticatedSession',
      accountId,
    };
  }

  return { kind: 'UnauthenticatedSession' };
}
