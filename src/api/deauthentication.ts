import { makeSuccess } from '../shared/api-response';
import { disablePrivateNavbarCookie } from './app-cookie';
import { AppRequestHandler } from './request-handler';
import { deinitSession } from './session';

export const deauthentication: AppRequestHandler = async function deauthentication(
  _reqId,
  _reqBody,
  _reqParams,
  reqSession,
  _app
) {
  deinitSession(reqSession);

  const logData = {};
  const responseData = {};
  const cookies = [disablePrivateNavbarCookie];

  return makeSuccess('Have a nice day!', logData, responseData, cookies);
};
