import { makeSuccess } from '../shared/api-response';
import { AppRequestHandler } from './request-handler';

export const sessionTest: AppRequestHandler = async function sessionTest(
  _reqId,
  _reqBody,
  _reqParams,
  reqSession,
  _app
) {
  (reqSession as any).works = true;

  return makeSuccess('This is an endpoint to test the HTTP session mechanism', { sessionId: reqSession.id });
};
