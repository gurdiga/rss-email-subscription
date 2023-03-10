import { Request, RequestHandler as ExpressRequestHandler, Response } from 'express';
import { ApiResponse, Success } from '../shared/api-response';
import { exhaustivenessCheck } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { AppCookie } from './app-cookie';
import { App } from './init-app';
import { ReqSession } from './session';

export type RequestHandler = (
  reqId: number,
  reqBody: Request['body'],
  reqParams: Request['query'],
  reqSession: ReqSession,
  app: App
) => Promise<ApiResponse>;

export function makeRequestHandler(handler: RequestHandler, app: App): ExpressRequestHandler {
  return async (req, res) => {
    const reqId = new Date().getTime();
    const reqBody = (req.body || {}) as unknown;
    const reqParams = req.query || {};
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

    switch (result.kind) {
      case 'Success': {
        logInfo(si`${action} succeeded`, { ...result.logData, durationMs });
        delete result.logData;
        sendSuccess(res, result);
        break;
      }
      case 'NotAuthenticatedError': {
        logWarning(si`${action} not authenticated`, { durationMs });
        res.status(401).send(result);
        break;
      }
      case 'InputError': {
        logWarning(si`${action} input error`, { message: result.message, durationMs });
        res.status(400).send(result);
        break;
      }
      case 'AppError': {
        logError(si`${action} failed`, { message: result.message, durationMs });
        res.status(500).send(result);
        break;
      }
      default:
        exhaustivenessCheck(result);
    }
  };
}

function sendSuccess(res: Response, result: Success): void {
  maybeSetCookies(res, result.cookies);
  sendJson(res, result);
}

function sendJson(res: Response, result: Success): void {
  res.status(200).json(result);
}

function maybeSetCookies(res: Response, cookies?: AppCookie[]): void {
  if (!cookies) {
    return;
  }

  for (const cookie of cookies) {
    res.cookie(cookie.name, cookie.value, cookie.options || {});
  }
}
