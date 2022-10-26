import { AccountId } from '../domain/account-index';
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

type SessionValue = string | number | boolean;

export function storeSessionValue(reqSession: ReqSession, name: string, value: SessionValue): void {
  reqSession[name] = value;
}

export function deleteSessionValue(reqSession: ReqSession, name: string): void {
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
