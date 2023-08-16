import { demoAccountEmail } from '../domain/demo-account';
import { makeSuccess } from '../shared/api-response';
import { disablePrivateNavbarCookie, unsetDemoCookie } from './app-cookie';
import { AppRequestHandler } from './app-request-handler';
import { checkSession, deinitSession, isAuthenticatedSession } from './session';

export const deauthentication: AppRequestHandler = async function deauthentication(
  _reqId,
  _reqBody,
  _reqParams,
  reqSession,
  _app
) {
  const isDemoAccount = isAuthenticatedDemoAccount(reqSession);

  deinitSession(reqSession);

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
