import { AppSettings, loadAppSettings } from '../domain/app-settings';
import { requireEnv } from '../shared/env';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppStorage, makeStorage } from '../shared/storage';

export interface App {
  storage: AppStorage;
  settings: AppSettings;
}

export interface AppEnv {
  DATA_DIR_ROOT: string;
}

export function initApp(): App {
  const { logError } = makeCustomLoggers({ module: initApp.name });
  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT']);

  if (isErr(env)) {
    logError(`Invalid environment`, { reason: env.reason });
    process.exit(1);
  }

  const storage = makeStorage(env.DATA_DIR_ROOT);
  const settings = loadAppSettings(storage);

  if (isErr(settings)) {
    logError(`Can’t load app settings`, { reason: settings.reason });
    process.exit(1);
  }

  return { storage, settings };
}
