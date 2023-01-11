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
    const reqBody = (req.body || {}) as unknown;
    const reqParams = req.params || {};
    const reqSession = req.session || {};
    const action = handler.name;

    const { logInfo, logError, logWarning } = makeCustomLoggers({
      reqId,
      module: 'api',
      referer: req.get('Referer'),
      userAgent: req.get('User-Agent'),
    });

    logInfo(action, { reqId, reqBody, reqParams });

    const start = new Date();
    const result = await handler(reqId, reqBody, reqParams, reqSession, app);
    const durationMs = new Date().getTime() - start.getTime();

    if (isSuccess(result)) {
      logInfo(si`${action} succeeded`, { ...result.logData, durationMs });
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
