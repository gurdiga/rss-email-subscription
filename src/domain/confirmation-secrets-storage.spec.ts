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
import { confirmationSecretLength, makeConfirmationSecretNotFound } from './confirmation-secrets';
import {
  storeConfirmationSecret,
  deleteConfirmationSecret,
  loadConfirmationSecret,
} from './confirmation-secrets-storage';
import { AppStorage } from './storage';

const secret = makeTestConfirmationSecret('X'.repeat(confirmationSecretLength));
const accountId = makeTestAccountId();
const storageErr = makeErr('Boom!');

describe(storeConfirmationSecret.name, () => {
  it('stores the given confirmation secret', () => {
    const storeItem = makeSpy<AppStorage['storeItem']>();
    const storage = makeTestStorage({ storeItem });

    storeConfirmationSecret(storage, secret, accountId);

    expect(storeItem.calls).to.deep.equal([[si`/confirmation-secrets/${secret.value}.json`, accountId]]);
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
});
