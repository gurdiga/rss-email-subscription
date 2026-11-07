import { expect } from 'chai';
import { isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  makeSpy,
  makeTestStorage,
  makeStub,
  makeTestConfirmationSecret,
  makeTestAccountId,
  makeTestStorageFromSnapshot,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { AccountId, makeAccountId } from './account';
import {
  accountControlSecretKinds,
  ConfirmationSecret,
  confirmationSecretLength,
  confirmationSecretLifetimeMs,
  isConfirmationSecretNotFound,
  makeConfirmationSecretNotFound,
  makeRandomConfirmationSecret,
} from './confirmation-secrets';
import {
  storeConfirmationSecret,
  deleteConfirmationSecret,
  loadConfirmationSecret,
  loadConfirmationSecretOfKind,
  revokeAccountSecrets,
} from './confirmation-secrets-storage';
import { AppStorage } from './storage';

const secret = makeTestConfirmationSecret('a'.repeat(confirmationSecretLength));
const accountId = makeTestAccountId();
const storageErr = makeErr('Boom!');
const ownAccountId = makeAccountId('a'.repeat(64)) as AccountId;
const otherAccountId = makeAccountId('b'.repeat(64)) as AccountId;

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

describe(loadConfirmationSecretOfKind.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('reads a secret of another kind as not found, and leaves it in place', () => {
    const storage = makeTestStorageFromSnapshot({});
    const secret = storeSecret(storage, 'EmailChangeRequestSecretData', ownAccountId);

    const result = loadConfirmationSecretOfKind(storage, secret, 'RegistrationConfirmationSecretData');

    expect(isConfirmationSecretNotFound(result), JSON.stringify(result)).to.be.true;
    expect(secretExists(storage, secret), 'the secret survives').to.be.true;
  });

  it('returns a secret of the requested kind', () => {
    const storage = makeTestStorageFromSnapshot({});
    const secret = storeSecret(storage, 'EmailChangeRequestSecretData', ownAccountId);

    const result = loadConfirmationSecretOfKind<any>(storage, secret, 'EmailChangeRequestSecretData');

    expect(result.kind).to.equal('EmailChangeRequestSecretData', JSON.stringify(result));
  });
});

describe(revokeAccountSecrets.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('deletes the account’s secrets of the given kinds, whichever way they store the ID', () => {
    const storage = makeTestStorageFromSnapshot({});
    const emailChange = storeSecret(storage, 'EmailChangeRequestSecretData', ownAccountId);
    const reset = storeSecret(storage, 'PasswordResetConfirmationSecretData', ownAccountId.value);

    const result = revokeAccountSecrets(storage, ownAccountId, accountControlSecretKinds);
    expect(isErr(result), JSON.stringify(result)).to.be.false;

    expect(secretExists(storage, emailChange), 'email change revoked').to.be.false;
    expect(secretExists(storage, reset), 'reset revoked').to.be.false;
  });

  it('leaves other accounts’ secrets alone', () => {
    const storage = makeTestStorageFromSnapshot({});
    const ours = storeSecret(storage, 'PasswordResetConfirmationSecretData', ownAccountId.value);
    const theirs = storeSecret(storage, 'PasswordResetConfirmationSecretData', otherAccountId.value);

    revokeAccountSecrets(storage, ownAccountId, accountControlSecretKinds);

    expect(secretExists(storage, ours), 'our secret revoked').to.be.false;
    expect(secretExists(storage, theirs), 'other account’s secret untouched').to.be.true;
  });

  it('leaves secrets of kinds not asked for alone', () => {
    const storage = makeTestStorageFromSnapshot({});
    const registration = storeSecret(storage, 'RegistrationConfirmationSecretData', ownAccountId);

    revokeAccountSecrets(storage, ownAccountId, accountControlSecretKinds);

    expect(secretExists(storage, registration), 'registration secret untouched').to.be.true;
  });

  it('skips legacy secrets stored without a kind', () => {
    const storage = makeTestStorageFromSnapshot({});
    const legacy = makeRandomConfirmationSecret();

    storeConfirmationSecret(storage, legacy, { accountId: ownAccountId.value });

    const result = revokeAccountSecrets(storage, ownAccountId, accountControlSecretKinds);
    expect(isErr(result), JSON.stringify(result)).to.be.false;

    expect(secretExists(storage, legacy), 'legacy secret left in place').to.be.true;
  });
});

function storeSecret(storage: AppStorage, kind: string, accountIdData: AccountId | string): ConfirmationSecret {
  const secret = makeRandomConfirmationSecret();

  storeConfirmationSecret(storage, secret, { kind, accountId: accountIdData });

  return secret;
}

function secretExists(storage: AppStorage, secret: ConfirmationSecret): boolean {
  const result = loadConfirmationSecret(storage, secret);

  return !isErr(result) && !isConfirmationSecretNotFound(result);
}
