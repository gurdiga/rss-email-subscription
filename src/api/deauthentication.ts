import { demoAccountEmail } from '../domain/demo-account';
import { makeSuccess } from '../shared/api-response';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { disablePrivateNavbarCookie, unsetDemoCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { checkSession, deinitSession, isAuthenticatedSession } from './session';

export const deauthentication: AppRequestHandler = async function deauthentication(
  reqId,
  _reqBody,
  _reqParams,
  reqSession,
  _app
) {
  const { logWarning } = makeCustomLoggers({ module: deauthentication.name, reqId });
  const isDemoAccount = isAuthenticatedDemoAccount(reqSession);
  const deinitResult = await deinitSession(reqSession);

  if (isErr(deinitResult)) {
    logWarning(si`Failed to ${deinitSession.name}`, { reason: deinitResult.reason });
  }

  const logData = {};
  const responseData = {};

  const maybeUnsetDemoCookie = isDemoAccount ? [unsetDemoCookie] : [];
  const cookies = [disablePrivateNavbarCookie, ...maybeUnsetDemoCookie];

  return makeSuccess('Have a nice day!', logData, responseData, cookies);
};

function isAuthenticatedDemoAccount(reqSession: any): boolean {
  const session = checkSession(reqSession);
  const accountEmail = isAuthenticatedSession(session) ? session.email.value : undefined;

  return accountEmail === demoAccountEmail;
}
