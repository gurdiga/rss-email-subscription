import { isErr, makeErr, Result } from '../shared/lang';
import { AppStorage } from '../shared/storage';

export interface AppSettings {
  kind: 'AppSettings';
  hashingSalt: string;
}

const hashingSaltLength = 16;

export function loadAppSettings(storage: AppStorage): Result<AppSettings> {
  const loadItemResult = storage.loadItem('/settings.json');

  if (isErr(loadItemResult)) {
    return makeErr(`Could not read app settings: ${loadItemResult.reason}.`);
  }

  const { hashingSalt } = loadItemResult;

  if (!hashingSalt) {
    return makeErr('Hashing salt is missing in app settings.');
  }

  if (typeof hashingSalt !== 'string') {
    return makeErr('Hashing salt is not a string in app settings.');
  }

  if (hashingSalt.length !== hashingSaltLength) {
    return makeErr('Hashing salt is too short in app settings.');
  }

  return {
    kind: 'AppSettings',
    hashingSalt,
  };
}
