import { makeSuccess } from '../shared/api-response';
import { AppRequestHandler } from './request-handler';
import { storeSessionValue } from './session';

export const sessionTest: AppRequestHandler = async function sessionTest(
  _reqId,
  _reqBody,
  _reqParams,
  reqSession,
  _app
) {
  storeSessionValue(reqSession, 'works', true);

  const logData = {};
  const responseData = { sessionId: reqSession.id };

  return makeSuccess('This is an endpoint to test the HTTP session mechanism', logData, responseData);
};
