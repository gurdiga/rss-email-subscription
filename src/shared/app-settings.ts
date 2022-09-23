import { makeErr, Result } from './lang';
import { AppStorage } from './storage';

export interface AppSettings {
  kind: 'AppSettings';
  hashingSalt: string;
}

const hashingSaltLength = 16;

export function loadAppSettings(storage: AppStorage): Result<AppSettings> {
  const { hashingSalt } = storage.loadItem('/settings.json');

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
