import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { makeErr } from '../shared/lang';
import { makeSpy, makeStorageStub, makeStub, Spy, Stub } from '../shared/test-utils';
import {
  AccountIndex,
  accountIndexStorageKey,
  addEmailToIndex,
  findAccountIdByEmail,
  removeEmailFromIndex,
  storedAccountIndex,
} from './account-index';

describe(addEmailToIndex.name, () => {
  const email = makeEmailAddress('test@test.com') as EmailAddress;

  it('stores email and account ID associated into index', () => {
    const index: AccountIndex = { version: 1 };
    const initialVersion = index.version;

    const storage = makeStorageStub({ loadItem: () => index });
    const accountId = 123;

    addEmailToIndex(storage, accountId, email);

    expect(index.version).not.to.equal(initialVersion);
    expect(index[email.value]).to.equal(accountId);
  });
});

describe(storedAccountIndex.name, () => {
  it('stores account index, versioned', () => {
    const index: AccountIndex = { version: 1, 'some@test.com': 123456 };
    const storage = makeStorageStub({
      loadItem: () => index,
      storeItem: makeSpy(),
    });

    let version = 1;
    const generateIndexVersionFn = makeStub(() => (version += 5)); // Any function goes as long as it returns a number.
    const expectedStoredVersion = 6;

    storedAccountIndex(storage, index, generateIndexVersionFn);

    expect((storage.storeItem as Spy).calls).to.deep.equal([
      [accountIndexStorageKey, { ...index, version: expectedStoredVersion }],
    ]);
  });

  it('fails when index version in storage changed since initial read', () => {
    const initialIndex: AccountIndex = { version: 1, 'some@test.com': 123456 };
    const storage = makeStorageStub({
      loadItem: () => ({ ...initialIndex, version: 1.1 }),
      storeItem: makeSpy(),
    });
    const result = storedAccountIndex(storage, initialIndex);

    expect(result).to.deep.equal(makeErr('Account index version changed since last read'));
    expect((storage.storeItem as Spy).calls).to.be.empty;
  });
});

describe(removeEmailFromIndex.name, () => {
  it('removes corresponding email-to-accountId pair from index', () => {
    const emailToRemove = 'test-2@test.com';
    const emailToKeep = 'test-1@test.com';
    const initialIndex: AccountIndex = {
      version: 1,
      [emailToKeep]: 1,
      [emailToRemove]: 2,
    };

    const storage = makeStorageStub({
      loadItem: () => initialIndex,
      storeItem: makeSpy(),
    });

    removeEmailFromIndex(storage, makeEmailAddress(emailToRemove) as EmailAddress);

    const updatedIndex = (storage.storeItem as Stub).calls[0]![1];

    expect(updatedIndex[emailToRemove]).be.undefined;
    expect(updatedIndex[emailToKeep]).to.equal(initialIndex[emailToKeep]);
  });
});

describe(findAccountIdByEmail.name, () => {
  it('returns the account ID corresponding to the given email', () => {
    const index: AccountIndex = {
      version: 1,
      'email-1@test.com': 1,
      'email-2@test.com': 2,
    };

    const storage = makeStorageStub({ loadItem: () => index });
    const email = makeEmailAddress('email-2@test.com') as EmailAddress;

    const accountId = findAccountIdByEmail(storage, email);

    expect(accountId).to.equal(2);
  });
});
