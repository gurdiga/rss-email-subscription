import { StorageKey, StorageValue } from '../domain/storage';
import { makeTestEmailAddress, makeTestStorageFromSnapshot } from '../shared/test-utils';
import { RegenerateSession } from './app-request-handler';
import { App } from './init-app';
import { ReqSession } from './session';

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

interface MockSessionMethods {
  destroy(callback: (err?: unknown) => void): void;
}

// A bare {} or { cookie: {} } stands in for req.session fine until a handler calls
// deinitSession, which calls the real express-session Session.prototype.destroy —
// absent on a plain object literal. Spread this in wherever a test's session gets
// logged out or otherwise terminated (not needed for clearSessionFields, which
// never calls destroy).
export function makeMockSessionMethods(): MockSessionMethods {
  return {
    destroy(callback: (err?: unknown) => void) {
      callback();
    },
  };
}

// Stands in for the closure makeAppRequestHandler wires up around the real
// express-session regenerate() call. Defaults to echoing back the same session
// object, so specs that don’t care about rotation see no behavior change; pass a
// distinct session to specs that need to assert a handler switched to the new one.
export function makeMockRegenerateSession(newReqSession: ReqSession): RegenerateSession {
  return async () => newReqSession;
}
