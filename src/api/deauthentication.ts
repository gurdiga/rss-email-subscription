import { makeSuccess } from '../shared/api-response';
import { RequestHandler } from './request-handler';
import { deinitSession } from './session';

export const deauthentication: RequestHandler = async function deauthentication(
  _reqId,
  _reqBody,
  _reqParams,
  reqSession,
  _app
) {
  deinitSession(reqSession);

  return makeSuccess('Have a nice day!');
};
