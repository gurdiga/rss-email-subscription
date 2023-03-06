import { UiAccount } from '../domain/account';
import { loadAccount } from '../domain/account-storage';
import { getPlanName } from '../domain/plan';
import { makeAppError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const loadCurrentAccount: RequestHandler = async function loadCurrentAccount(
  reqId,
  _reqBody,
  _reqParams,
  reqSession,
  app
) {
  const { logWarning, logError } = makeCustomLoggers({ module: loadCurrentAccount.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.reason });
    return makeNotAuthenticatedError();
  }

  const { accountId } = session;
  const account = loadAccount(app.storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return makeAppError('Application error');
  }

  const logData = {};
  const responseData: UiAccount = {
    planName: getPlanName(account.planId),
    email: account.email.value,
  };

  return makeSuccess<UiAccount>('The UI account info', logData, responseData);
};
