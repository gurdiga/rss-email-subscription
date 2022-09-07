import { makeAppError } from '../shared/api-response';
import { AppRequestHandler } from './shared';

export const createAccount: AppRequestHandler = async function oneClickUnsubscribe(
  reqId,
  reqBody,
  _reqParams,
  dataDirRoot
) {
  console.log({ reqId, reqBody, _reqParams, dataDirRoot });

  return makeAppError('Not implemented');
};
