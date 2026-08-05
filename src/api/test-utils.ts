import { StorageKey, StorageValue } from '../domain/storage';
import { makeTestEmailAddress, makeTestStorageFromSnapshot } from '../shared/test-utils';
import { App } from './init-app';

// Specs derive account IDs with this to match what the handlers compute from
// settings.hashingSalt, so it is part of the fixture rather than an arbitrary string.
export const hashingSalt = 'test-hashing-salt';

// A minimal App that request handlers accept. Lives here rather than in
// shared/test-utils because App comes from the api layer, and shared/ otherwise depends
// only on domain/.
export function makeTestApp(storageSnapshot: Record<StorageKey, StorageValue> = {}): App {
  return {
    storage: makeTestStorageFromSnapshot(storageSnapshot),
    settings: {
      kind: 'AppSettings',
      hashingSalt,
      fullEmailAddress: {
        kind: 'FullEmailAddress',
        emailAddress: makeTestEmailAddress('noreply@test.com'),
        displayName: 'Test',
      },
    } as any,
    env: {
      DOMAIN_NAME: 'test.feedsubscription.com',
      SMTP_CONNECTION_STRING: 'smtp://localhost:1587',
    } as any,
  };
}
