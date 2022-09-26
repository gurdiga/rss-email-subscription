import { AppSettings, loadAppSettings } from '../domain/app-settings';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppStorage, makeStorage } from '../shared/storage';

export interface App {
  storage: AppStorage;
  settings: AppSettings;
}

export function initApp(): App {
  const { logError } = makeCustomLoggers({ module: initApp.name });
  const dataDirRoot = process.env['DATA_DIR_ROOT'];

  if (!dataDirRoot) {
    logError(`ERROR: DATA_DIR_ROOT envar missing`);
    process.exit(1);
  }

  const storage = makeStorage(dataDirRoot);
  const settings = loadAppSettings(storage);

  if (isErr(settings)) {
    logError(`ERROR: Can’t load app settings: ${settings.reason}`);
    process.exit(1);
  }

  return { storage, settings };
}
