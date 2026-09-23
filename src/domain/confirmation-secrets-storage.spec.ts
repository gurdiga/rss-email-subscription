import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  makeSpy,
  makeTestStorage,
  makeStub,
  makeTestConfirmationSecret,
  makeTestAccountId,
} from '../shared/test-utils';
import {
  confirmationSecretLength,
  confirmationSecretLifetimeMs,
  makeConfirmationSecretNotFound,
} from './confirmation-secrets';
import {
  storeConfirmationSecret,
  deleteConfirmationSecret,
  loadConfirmationSecret,
} from './confirmation-secrets-storage';
import { AppStorage } from './storage';

const secret = makeTestConfirmationSecret('a'.repeat(confirmationSecretLength));
const accountId = makeTestAccountId();
const storageErr = makeErr('Boom!');

describe(storeConfirmationSecret.name, () => {
  it('stores the given confirmation secret with a timestamp', () => {
    const storeItem = makeSpy<AppStorage['storeItem']>();
    const storage = makeTestStorage({ storeItem });
    const timestamp = new Date('2023-07-18');

    storeConfirmationSecret(storage, secret, accountId, timestamp);

    expect(storeItem.calls).to.deep.equal([
      [si`/confirmation-secrets/${secret.value}.json`, { ...accountId, timestamp }],
    ]);
  });

  it('returns an Err value when storage fails', () => {
    const storage = makeTestStorage({ storeItem: () => storageErr });
    const result = storeConfirmationSecret(storage, secret, accountId);

    expect(result).to.deep.equal(storageErr);
  });
});

describe(deleteConfirmationSecret.name, () => {
  it('deletes the corresponding storage item', () => {
    const hasItem = makeStub<AppStorage['hasItem']>(() => true);
    const removeItem = makeSpy<AppStorage['removeItem']>();
    const storage = makeTestStorage({ hasItem, removeItem });

    deleteConfirmationSecret(storage, secret);

    expect(removeItem.calls).to.deep.equal([[si`/confirmation-secrets/${secret.value}.json`]]);
  });

  it('returns an Err value when storage fails', () => {
    const storage = makeTestStorage({ hasItem: () => true, removeItem: () => storageErr });
    const result = deleteConfirmationSecret(storage, secret);

    expect(result).to.deep.equal(storageErr);
  });
});

describe(loadConfirmationSecret.name, () => {
  it('returns the content of the contents of the appropriate storage item', () => {
    const hasItem = makeStub<AppStorage['hasItem']>(() => true);
    const loadItem = makeStub(() => accountId);
    const storage = makeTestStorage({ hasItem, loadItem });
    const result = loadConfirmationSecret(storage, secret);

    expect(hasItem.calls).to.have.lengthOf(1);
    expect(loadItem.calls).to.deep.equal([[si`/confirmation-secrets/${secret.value}.json`]]);
    expect(result).to.equal(accountId);
  });

  it('returns ConfirmationSecretNotFound when the case', () => {
    const hasItem = makeStub<AppStorage['hasItem']>(() => false);
    const loadItem = makeStub(() => accountId);
    const storage = makeTestStorage({ hasItem, loadItem });
    const result = loadConfirmationSecret(storage, secret);

    expect(hasItem.calls).to.have.lengthOf(1);
    expect(loadItem.calls).to.be.empty;
    expect(result).to.deep.equal(makeConfirmationSecretNotFound(secret));
  });

  it('returns an Err value when storage fails', () => {
    const hasItem = makeStub<AppStorage['hasItem']>(() => true);
    const storage = makeTestStorage({ hasItem, loadItem: () => storageErr });
    const result = loadConfirmationSecret(storage, secret);

    expect(hasItem.calls).to.have.lengthOf(1);
    expect(result).to.deep.equal(storageErr);
  });

  it('returns ConfirmationSecretNotFound for a secret past its lifetime, ahead of cleanup', () => {
    const justPastLifetime = new Date(Date.now() - confirmationSecretLifetimeMs - 1000);
    const hasItem = makeStub<AppStorage['hasItem']>(() => true);
    const loadItem = makeStub(() => ({ ...accountId, timestamp: justPastLifetime }));
    const storage = makeTestStorage({ hasItem, loadItem });

    const result = loadConfirmationSecret(storage, secret);

    expect(result).to.deep.equal(makeConfirmationSecretNotFound(secret));
  });

  it('returns ConfirmationSecretNotFound for a JSON-round-tripped timestamp past its lifetime', () => {
    const justPastLifetime = new Date(Date.now() - confirmationSecretLifetimeMs - 1000);
    const hasItem = makeStub<AppStorage['hasItem']>(() => true);
    const loadItem = makeStub(() => ({ ...accountId, timestamp: justPastLifetime.toISOString() }));
    const storage = makeTestStorage({ hasItem, loadItem });

    const result = loadConfirmationSecret(storage, secret);

    expect(result).to.deep.equal(makeConfirmationSecretNotFound(secret));
  });

  it('still returns the content for a secret within its lifetime', () => {
    const justWithinLifetime = new Date(Date.now() - confirmationSecretLifetimeMs + 60_000);
    const storedData = { ...accountId, timestamp: justWithinLifetime };
    const hasItem = makeStub<AppStorage['hasItem']>(() => true);
    const loadItem = makeStub(() => storedData);
    const storage = makeTestStorage({ hasItem, loadItem });

    const result = loadConfirmationSecret(storage, secret);

    expect(result).to.deep.equal(storedData);
  });
});
