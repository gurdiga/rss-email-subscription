import { AppSettings, loadAppSettings } from '../domain/app-settings';
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
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_PRICE_ID: string;
}

export function initApp(): App {
  const { logError } = makeCustomLoggers({ module: initApp.name });
  const env = requireEnv<AppEnv>([
    'DATA_DIR_ROOT',
    'DOMAIN_NAME',
    'SMTP_CONNECTION_STRING',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_ID',
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
