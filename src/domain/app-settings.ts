import { FullEmailAddress, makeFullEmailAddress } from '../app/email-sending/emails';
import { makeEmailAddress } from './email-address-making';
import { isErr, makeErr, Result } from '../shared/lang';
import { AppStorage } from '../storage/storage';
import { si } from '../shared/string-utils';

export interface AppSettings {
  kind: 'AppSettings';
  hashingSalt: string;
  fullEmailAddress: FullEmailAddress;
}

export interface SettingsJson {
  hashingSalt: string;
  displayName: string;
  emailAddress: string;
}

const hashingSaltLength = 16;
export const appSettingsStorageKey = '/settings.json';

export function loadAppSettings(storage: AppStorage): Result<AppSettings> {
  const loadItemResult = storage.loadItem(appSettingsStorageKey) as SettingsJson;

  if (isErr(loadItemResult)) {
    return makeErr(si`Could not read app settings: ${loadItemResult.reason}.`);
  }

  const hashingSalt = makeHashingSalt(loadItemResult.hashingSalt);

  if (isErr(hashingSalt)) {
    return hashingSalt;
  }

  const displayName = makeDisplayName(loadItemResult.displayName);

  if (isErr(displayName)) {
    return displayName;
  }

  const emailAddress = makeEmailAddress(loadItemResult.emailAddress);

  if (isErr(emailAddress)) {
    return emailAddress;
  }

  const fullEmailAddress = makeFullEmailAddress(displayName, emailAddress);

  return {
    kind: 'AppSettings',
    hashingSalt,
    fullEmailAddress,
  };
}

function makeHashingSalt(value: unknown): Result<string> {
  if (!value) {
    return makeErr('Hashing salt is missing in app settings.');
  }

  if (typeof value !== 'string') {
    return makeErr('Hashing salt is not a string in app settings.');
  }

  if (value.length !== hashingSaltLength) {
    return makeErr('Hashing salt is too short in app settings.');
  }

  return value;
}

function makeDisplayName(value: unknown): Result<string> {
  if (!value) {
    return makeErr('Display name is missing in app settings.');
  }

  if (typeof value !== 'string') {
    return makeErr('Display name is not a string in app settings.');
  }

  if (value.length === 0) {
    return makeErr('Display name is empty in app settings.');
  }

  return value;
}
