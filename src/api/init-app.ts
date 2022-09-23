import { AppSettings, loadAppSettings } from '../shared/app-settings';
import { isErr } from '../shared/lang';
import { AppStorage, makeStorage } from '../shared/storage';

export interface App {
  storage: AppStorage;
  settings: AppSettings;
}

export function initApp(): App {
  const dataDirRoot = process.env['DATA_DIR_ROOT'];

  if (!dataDirRoot) {
    console.error(`DATA_DIR_ROOT envar missing`);
    process.exit(1);
  }

  const storage = makeStorage(dataDirRoot);
  const settings = loadAppSettings(storage);

  if (isErr(settings)) {
    console.error(settings.reason);
    process.exit(1);
  }

  return { storage, settings };
}
