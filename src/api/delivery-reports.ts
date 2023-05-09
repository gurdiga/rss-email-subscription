import { makeAppError } from '../shared/api-response';
import { AppRequestHandler } from './app-request-handler';

export const deliveryReports: AppRequestHandler = async function deliveryReports(
  _reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  _app
) {
  return makeAppError('Not implemented');
};
