import { RequestHandler } from 'express';
import { basename } from 'node:path';
import { ApiResponse, isAppError, isInputError, isSuccess } from '../shared/api-response';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';

export type AppRequestHandler = (
  reqId: number,
  reqBody: Record<string, any>,
  reqParams: Record<string, any>,
  app: App
) => Promise<ApiResponse>;

export async function makeRequestHandler(handler: AppRequestHandler, app: App): Promise<RequestHandler> {
  return async (req, res) => {
    const reqId = +new Date();
    const { logInfo, logError, logWarning } = makeCustomLoggers({ reqId, module: basename(__filename) });

    const reqBody = req.body || {};
    const reqParams = req.params || {};
    const action = handler.name;

    logInfo(action, { reqId, action, reqBody, reqParams });

    const result = await handler(reqId, reqBody, reqParams, app);

    if (isSuccess(result)) {
      logInfo(`${action} succeded`, result.logData);
      res.status(200).send(result);
    } else if (isInputError(result)) {
      logWarning(`${action} input error`, { message: result.message });
      res.status(400).send(result);
    } else if (isAppError(result)) {
      logError(`${action} failed`, { message: result.message });
      res.status(500).send(result);
    }
  };
}
