import { makeSuccess } from '../shared/api-response';
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

  return makeSuccess('Have a nice day!');
};
