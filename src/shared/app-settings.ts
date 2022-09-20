import { makeErr, Result } from './lang';

export interface AppSettings {
  kind: 'AppSettings';
  hashingSalt: string;
  dataDirRoot: string;
}

export function loadAppSettings(): Result<AppSettings> {
  return makeErr('Not implemented');
}
