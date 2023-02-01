import { RequestHandler } from 'express';
import { AppSettings, loadAppSettings } from '../domain/app-settings';
import { requireEnv } from '../shared/env';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppStorage, makeStorage } from '../shared/storage';
import { si } from '../shared/string-utils';

export interface App {
  storage: AppStorage;
  settings: AppSettings;
  env: AppEnv;
}

export interface AppEnv {
  DATA_DIR_ROOT: string;
  DOMAIN_NAME: string;
}

export function initApp(): App {
  const { logError } = makeCustomLoggers({ module: initApp.name });
  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    process.exit(1);
  }

  const storage = makeStorage(env.DATA_DIR_ROOT);
  const settings = loadAppSettings(storage);

  if (isErr(settings)) {
    logError(si`Failed to ${loadAppSettings.name}`, { reason: settings.reason });
    process.exit(1);
  }

  return { storage, settings, env };
}

export const devOnly_RemoveCSPForSafari: RequestHandler = (req, res, next) => {
  if (req.headers['user-agent']?.includes('Safari/')) {
    // In Safari, the CSP header overrides the <meta> CSP, and messes things up:
    // Failed to load resource: An SSL error has occurred and a secure connection to the server cannot be made.
    res.removeHeader('Content-Security-Policy');
  }

  next();
};
