import { expect } from 'chai';
import {
  ConfirmationSecret,
  isConfirmationSecretNotFound,
  makeRandomConfirmationSecret,
} from '../../domain/confirmation-secrets';
import { loadConfirmationSecret, storeConfirmationSecret } from '../../domain/confirmation-secrets-storage';
import { AppStorage } from '../../domain/storage';
import { isErr } from '../../shared/lang';
import { makeTestStorageFromSnapshot, purgeTestStorageFromSnapshot } from '../../shared/test-utils';
import { expireConfirmationSecrets } from './index';

const oneDayMs = 24 * 3600 * 1000;

describe(expireConfirmationSecrets.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  // Registration secrets used to be exempt from expiry altogether, so the store only ever
  // grew — and issuing a password reset scans all of it. They expire now, but later than
  // everything else, because a signup email can sit unread for days.
  it('keeps a registration secret past the default lifetime but not past a week', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const recent = storeRegistrationSecret(storage, daysAgo(3));
    const stale = storeRegistrationSecret(storage, daysAgo(8));

    await runExpiry(storage);

    expect(secretExists(storage, recent), 'three days old — still valid').to.be.true;
    expect(secretExists(storage, stale), 'eight days old — expired').to.be.false;
  });

  it('still expires other kinds after the default 48 hours', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const fresh = storeResetSecret(storage, hoursAgo(1));
    const stale = storeResetSecret(storage, daysAgo(3));

    await runExpiry(storage);

    expect(secretExists(storage, fresh), 'an hour old — still valid').to.be.true;
    expect(secretExists(storage, stale), 'three days old — expired').to.be.false;
  });
});

// expireConfirmationSecrets doesn't return its promise, and everything inside it is
// synchronous I/O, so draining the microtask queue is enough to let it finish.
async function runExpiry(storage: AppStorage): Promise<void> {
  expireConfirmationSecrets(storage);

  await new Promise((resolve) => setImmediate(resolve));
}

function storeRegistrationSecret(storage: AppStorage, timestamp: Date): ConfirmationSecret {
  const secret = makeRandomConfirmationSecret();

  storeConfirmationSecret(storage, secret, { kind: 'RegistrationConfirmationSecretData' }, timestamp);

  return secret;
}

function storeResetSecret(storage: AppStorage, timestamp: Date): ConfirmationSecret {
  const secret = makeRandomConfirmationSecret();

  storeConfirmationSecret(storage, secret, { kind: 'PasswordResetConfirmationSecretData' }, timestamp);

  return secret;
}

function secretExists(storage: AppStorage, secret: ConfirmationSecret): boolean {
  const result = loadConfirmationSecret(storage, secret);

  return !isErr(result) && !isConfirmationSecretNotFound(result);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * oneDayMs);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600 * 1000);
}
