import { AppSettings, loadAppSettings } from '../domain/app-settings';
import { PaddleEnvironment } from '../domain/payment';
import { requireEnv } from '../shared/env';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppStorage, makeStorage } from '../domain/storage';
import { si } from '../shared/string-utils';

export interface App {
  storage: AppStorage;
  settings: AppSettings;
  env: AppEnv;
}

export interface AppEnv {
  DATA_DIR_ROOT: string;
  DOMAIN_NAME: string;
  SMTP_CONNECTION_STRING: string;
  PADDLE_CLIENT_TOKEN: string;
  PADDLE_API_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
  PADDLE_ENVIRONMENT: PaddleEnvironment;
}

export function initApp(): App {
  const { logError } = makeCustomLoggers({ module: initApp.name });
  const env = requireEnv<AppEnv>([
    'DATA_DIR_ROOT',
    'DOMAIN_NAME',
    'SMTP_CONNECTION_STRING',
    'PADDLE_CLIENT_TOKEN',
    'PADDLE_API_KEY',
    'PADDLE_WEBHOOK_SECRET',
    'PADDLE_ENVIRONMENT',
  ]);

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
