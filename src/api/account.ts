import { makeAppError } from '../shared/api-response';
import { RequestHandler } from './request-handler';

export const loadAccount: RequestHandler = async function loadAccount(_reqId, _reqBody, _reqParams, _reqSession, _app) {
  return makeAppError('Not implemented');
};
