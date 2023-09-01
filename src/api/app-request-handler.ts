import { Request, RequestHandler, Response } from 'express';
import uaParser from 'ua-parser-js';
import { ApiResponse, Success } from '../shared/api-response';
import { asyncAttempt, exhaustivenessCheck, isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { AppCookie, appCookies, sessionCookieMaxAge } from './app-cookie';
import { App } from './init-app';
import { ReqSession, SessionFieldName, isSessionCookieRolling } from './session';

export type AppRequestHandler = (
  reqId: string,
  reqBody: Request['body'],
  reqParams: Request['query'],
  reqSession: ReqSession,
  app: App
) => Promise<ApiResponse>;

export function makeAppRequestHandler(handler: AppRequestHandler, app: App): RequestHandler {
  return async (req, res) => {
    const reqId = req.get('X-Request-ID') || 'EMPTY_X-Request-ID';
    const reqBody = (req.body || {}) as unknown;
    const reqParams = req.query || {};
    const reqSession = req.session || {};
    const action = handler.name;

    const ua = getUaInfo(req.get('User-Agent'));

    const emailSessionField: SessionFieldName = 'email';
    const email = (reqSession as any)[emailSessionField] || undefined;

    const { logInfo, logError, logWarning } = makeCustomLoggers({
      reqId,
      module: 'api',
      referer: req.get('Referer'),
      ua,
      ip: req.headers['x-real-ip'] || 'EMPTY_x-real-ip',
      email,
    });

    logInfo(action, { reqId, reqBody, reqParams });

    const start = new Date();
    const result = await asyncAttempt(() => handler(reqId, reqBody, reqParams, reqSession, app));
    const durationMs = new Date().getTime() - start.getTime();

    if (isErr(result)) {
      logError('AppRequestHandler threw', { reason: result.reason, durationMs });
      res.status(500).send(result);
      return;
    }

    switch (result.kind) {
      case 'Success': {
        logInfo(si`${action} succeeded`, { ...result.logData, durationMs });
        delete result.logData;
        sendSuccess(req, res, result);
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

function getUaInfo(uaString: string | undefined) {
  const uaData = uaParser(uaString);

  return {
    device: si`${uaData.device.type || ''} ${uaData.device.vendor || ''} ${uaData.device.vendor || ''}`,
    browser: si`${uaData.browser.name || ''} ${uaData.browser.version || ''}`,
    os: si`${uaData.os.name || ''} ${uaData.os.version || ''}`,
  };
}

function sendSuccess(req: Request, res: Response, result: Success): void {
  maybeRollAppCookies(req, res, result.cookies);
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

function maybeRollAppCookies(req: Request, res: Response, newCookies: AppCookie[] = []): void {
  if (!isSessionCookieRolling) {
    return;
  }

  for (const cookie of appCookies) {
    const willBeSet = newCookies.find((x) => x.name === cookie.name);

    if (willBeSet) {
      continue;
    }

    const reqValue = req.cookies[cookie.name];

    if (!reqValue) {
      continue;
    }

    const options = cookie.options || {};

    if (options.isRolling) {
      options.maxAge = sessionCookieMaxAge;
      res.cookie(cookie.name, reqValue, options);
    }
  }
}
