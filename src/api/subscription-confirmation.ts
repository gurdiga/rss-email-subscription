import { AppRequestHandler } from './shared';

export const confirmSubscription: AppRequestHandler = function confirmSubscription(
  reqId,
  _reqBody,
  reqParams,
  dataDirRoot
) {
  return {
    kind: 'Success',
    message: 'OK',
    logData: 'TBD',
  };
};
