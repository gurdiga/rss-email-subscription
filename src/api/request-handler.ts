import { RequestHandler, Request } from 'express';
import { basename } from 'node:path';
import { ApiResponse, isAppError, isInputError, isSuccess } from '../shared/api-response';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';
import { ReqSession } from './session';

export type AppRequestHandler = (
  reqId: number,
  reqBody: Request['body'],
  reqParams: Request['params'],
  reqSession: ReqSession,
  app: App
) => Promise<ApiResponse>;

export function makeRequestHandler(handler: AppRequestHandler, app: App): RequestHandler {
  return async (req, res) => {
    const reqId = +new Date();
    const { logInfo, logError, logWarning } = makeCustomLoggers({ reqId, module: basename(__filename) });

    const reqBody = (req.body || {}) as unknown;
    const reqParams = req.params || {};
    const reqSession = req.session || {};
    const action = handler.name;
    const referer = req.get('Referer');

    logInfo(action, { reqId, action, reqBody, reqParams, referer });

    const start = new Date();
    const result = await handler(reqId, reqBody, reqParams, reqSession, app);
    const duration = new Date().getTime() - start.getTime();

    if (isSuccess(result)) {
      logInfo(`${action} succeded`, { ...result.logData, duration });
      delete result.logData;
      res.status(200).send(result);
    } else if (isInputError(result)) {
      logWarning(`${action} input error`, { message: result.message, duration });
      res.status(400).send(result);
    } else if (isAppError(result)) {
      logError(`${action} failed`, { message: result.message, duration });
      res.status(500).send(result);
    }
  };
}
