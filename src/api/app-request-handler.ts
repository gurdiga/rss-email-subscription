import { Request, RequestHandler, Response } from 'express';
import { ApiResponse, Success } from '../shared/api-response';
import { exhaustivenessCheck } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { App } from './init-app';
import { ReqSession, SessionFieldName } from './session';

export type AppRequestHandler = (
  reqId: number,
  reqBody: Request['body'],
  reqParams: Request['query'],
  reqSession: ReqSession,
  app: App
) => Promise<ApiResponse>;

export function makeAppRequestHandler(handler: AppRequestHandler, app: App): RequestHandler {
  return async (req, res) => {
    const reqId = new Date().getTime();
    const reqBody = (req.body || {}) as unknown;
    const reqParams = req.query || {};
    const reqSession = req.session || {};
    const action = handler.name;

    const emailSessionField: SessionFieldName = 'email';
    const email = (reqSession as any)[emailSessionField] || undefined;

    const { logInfo, logError, logWarning } = makeCustomLoggers({
      reqId,
      module: 'api',
      referer: req.get('Referer'),
      userAgent: req.get('User-Agent'),
      ip: req.headers['x-real-ip'] || 'EMPTY_x-real-ip',
      email,
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
  maybeSetCookies(res, result);
  sendJson(res, result);
}

function sendJson(res: Response, result: Success): void {
  res.status(200).json(result);
}

function maybeSetCookies(res: Response, result: Success): void {
  if (!result.cookies) {
    return;
  }

  for (const cookie of result.cookies) {
    res.cookie(cookie.name, cookie.value, cookie.options || {});
  }

  delete result.cookies;
}
