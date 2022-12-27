import { RequestHandler as ExpressRequestHandler, Request } from 'express';
import { ApiResponse, isAppError, isInputError, isSuccess } from '../shared/api-response';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { App } from './init-app';
import { ReqSession } from './session';

export type RequestHandler = (
  reqId: number,
  reqBody: Request['body'],
  reqParams: Request['params'],
  reqSession: ReqSession,
  app: App
) => Promise<ApiResponse>;

export function makeRequestHandler(handler: RequestHandler, app: App): ExpressRequestHandler {
  return async (req, res) => {
    const reqId = new Date().getTime();
    const { logInfo, logError, logWarning } = makeCustomLoggers({ reqId, module: makeRequestHandler.name });

    const reqBody = (req.body || {}) as unknown;
    const reqParams = req.params || {};
    const reqSession = req.session || {};
    const action = handler.name;
    const referer = req.get('Referer');

    logInfo(action, { reqId, action, reqBody, reqParams, referer });

    const start = new Date();
    const result = await handler(reqId, reqBody, reqParams, reqSession, app);
    const durationMs = new Date().getTime() - start.getTime();

    if (isSuccess(result)) {
      logInfo(si`${action} succeded`, { ...result.logData, durationMs });
      delete result.logData;
      res.status(200).send(result);
    } else if (isInputError(result)) {
      logWarning(si`${action} input error`, { message: result.message, durationMs });
      res.status(400).send(result);
    } else if (isAppError(result)) {
      logError(si`${action} failed`, { message: result.message, durationMs });
      res.status(500).send(result);
    }
  };
}
