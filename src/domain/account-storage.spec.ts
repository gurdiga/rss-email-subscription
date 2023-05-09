import { expect } from 'chai';
import { Err, isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  makeSpy,
  makeStub,
  makeTestAccount,
  makeTestAccountId,
  makeTestEmailAddress,
  makeTestStorage,
} from '../shared/test-utils';
import { Account, AccountData, AccountId, AccountIdList, makeAccountId, makeAccountNotFound } from './account';
import { getAccountIdByEmail } from './account-crypto';
import {
  confirmAccount,
  deleteAccount,
  getAccountIdList,
  getAccountRootStorageKey,
  getAccountStorageKey,
  loadAccount,
  setAccountEmail,
  storeAccount,
} from './account-storage';
import { HashedPassword, hashedPasswordLength, makeHashedPassword } from './hashed-password';
import { PlanId } from './plan';
import { AppStorage } from './storage';

const creationTimestamp = new Date();
export const accountId = makeTestAccountId();

describe(getAccountStorageKey.name, () => {
  it('returns path of account.json for the given AccountId', () => {
    const accountId = makeTestAccountId();
    const expectedPath = si`/accounts/${accountId.value}/account.json`;

    expect(getAccountStorageKey(accountId)).to.equal(expectedPath);
  });
});

describe(getAccountIdList.name, () => {
  it('returns a list of the stored AccountIds and any eventual errors', () => {
    const accountIds = Array.from('abc')
      .map((letter) => letter.repeat(64))
      .map((x) => makeAccountId(x)) as AccountId[];
    const validAccountIdStrings = accountIds.map((x) => x.value);

    const invalidAccountIdStrings = [42 as any as string, undefined as any as string];
    const errs = invalidAccountIdStrings.map((x) => makeAccountId(x)) as Err[];

    const subdirectoryNames = [...validAccountIdStrings, ...invalidAccountIdStrings];
    const storage = makeTestStorage({ listSubdirectories: () => subdirectoryNames });

    expect(getAccountIdList(storage)).to.deep.equal(<AccountIdList>{ accountIds, errs });
  });
});

describe(loadAccount.name, () => {
  it('returns an Account value for the given account ID', () => {
    const storageKey = '/account';
    const accountData: AccountData = {
      planId: PlanId.Free,
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      confirmationTimestamp: undefined,
      creationTimestamp,
    };
    const hasItem = makeStub(() => true);
    const loadItem = makeStub(() => accountData);
    const storage = makeTestStorage({ hasItem, loadItem });
    const result = loadAccount(storage, accountId, storageKey);

    const expectedResult: Account = {
      planId: PlanId.Free,
      email: makeTestEmailAddress(accountData.email),
      hashedPassword: makeHashedPassword(accountData.hashedPassword) as HashedPassword,
      creationTimestamp,
      confirmationTimestamp: undefined,
    };

    expect(hasItem.calls).to.deep.equal([[storageKey]]);
    expect(loadItem.calls).to.deep.equal([[storageKey]]);
    expect(result).to.deep.equal(expectedResult);
  });

  it('returns an Err value when storage fails', () => {
    const storage = makeTestStorage({ loadItem: () => makeErr('Bad sector!'), hasItem: () => true });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(makeErr('Failed to load account data: Bad sector!'));
  });

  it('returns an Err value when stored email is invalid', () => {
    const accountData: AccountData = {
      planId: PlanId.Free,
      email: 'not-an-email-really',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      confirmationTimestamp: undefined,
      creationTimestamp,
    };
    const storage = makeTestStorage({ loadItem: () => accountData, hasItem: () => true });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(
      makeErr(
        si`Invalid stored data for account ${accountId.value}: Email is syntactically incorrect: "not-an-email-really"`,
        'email'
      )
    );
  });

  it('returns an Err value when stored hashed password is invalid', () => {
    const accountData: AccountData = {
      planId: PlanId.Free,
      email: 'test@test.com',
      hashedPassword: 'la-la-la',
      confirmationTimestamp: undefined,
      creationTimestamp,
    };
    const storage = makeTestStorage({ loadItem: () => accountData, hasItem: () => true });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(
      makeErr(
        si`Invalid stored data for account ${accountId.value}: Invalid hashed password length: 8`,
        'hashedPassword'
      )
    );
  });
});

describe(storeAccount.name, () => {
  it('stores the given account data', () => {
    const account: Account = {
      planId: PlanId.Free,
      email: makeTestEmailAddress('test@test.com'),
      hashedPassword: makeHashedPassword('x'.repeat(hashedPasswordLength)) as HashedPassword,
      confirmationTimestamp: undefined,
      creationTimestamp,
    };
    const storeItem = makeSpy<AppStorage['storeItem']>();
    const loadItem = makeStub(() => getAccountData(account));
    const storage = makeTestStorage({ loadItem, storeItem });

    const result = storeAccount(storage, accountId, account);

    expect(storeItem.calls).to.deep.equal([[getAccountStorageKey(accountId), getAccountData(account)]]);
    expect(result).to.be.undefined;
  });
});

describe(confirmAccount.name, () => {
  it('sets confirmationTimestamp on the given account', () => {
    const accountData: AccountData = {
      planId: PlanId.Free,
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      confirmationTimestamp: undefined,
      creationTimestamp,
    };

    const loadItem = makeStub(() => accountData);
    const storeItem = makeSpy<AppStorage['storeItem']>();
    const hasItem = makeStub(() => true);
    const storage = makeTestStorage({ loadItem, storeItem, hasItem });

    const confirmationTimestamp = new Date('2022-10-07');

    const result = confirmAccount(storage, accountId, () => confirmationTimestamp);

    expect(isErr(result), si`result: ${JSON.stringify(result)}`).to.be.false;

    const expectedStoredData: AccountData = {
      planId: accountData.planId,
      email: accountData.email,
      hashedPassword: accountData.hashedPassword,
      confirmationTimestamp,
      creationTimestamp,
    };

    expect(hasItem.calls).to.deep.equal([[getAccountStorageKey(accountId)]]);
    expect(loadItem.calls).to.deep.equal([[getAccountStorageKey(accountId)]]);
    expect(storeItem.calls).to.deep.equal([[getAccountStorageKey(accountId), expectedStoredData]]);
    expect(result).to.be.undefined;
  });
});

describe(setAccountEmail.name, () => {
  const newEmail = makeTestEmailAddress('new-email@test.com');
  const hashingSalt = 'test-hashing-salt';

  it('stores the given email on the account and returns the old email', () => {
    const oldEmail = makeTestEmailAddress('old-email@test.com');
    const account = makeTestAccount({ email: oldEmail.value });
    const accountData = getAccountData(account);

    const hasItem = makeStub(() => true);
    const loadItem = makeStub(() => accountData);
    const storeItem = makeSpy<AppStorage['storeItem']>();
    const renameItem = makeSpy<AppStorage['renameItem']>();
    const storage = makeTestStorage({ hasItem, loadItem, storeItem, renameItem });

    const result = setAccountEmail(storage, accountId, newEmail, hashingSalt);

    expect(result).to.deep.equal(oldEmail);
    expect(hasItem.calls).not.to.be.empty;
    expect(storeItem.calls).to.deep.equal([
      [
        getAccountStorageKey(accountId),
        {
          planId: account.planId,
          email: newEmail.value,
          hashedPassword: account.hashedPassword.value,
          confirmationTimestamp: account.confirmationTimestamp,
          creationTimestamp: account.creationTimestamp,
        },
      ],
    ]);
    expect(renameItem.calls).to.deep.equal([
      [
        // prettier: keep these stacked
        getAccountRootStorageKey(accountId),
        getAccountRootStorageKey(getAccountIdByEmail(newEmail, hashingSalt)),
      ],
    ]);
  });

  it('returns AccountNotFound when the case', () => {
    const storage = makeTestStorage({ hasItem: () => false });
    const result = setAccountEmail(storage, accountId, newEmail, hashingSalt);

    expect(result).to.deep.equal(makeAccountNotFound());
  });

  it('returns the storage Err when any', () => {
    const storageErr = makeErr('Fails!');
    const storage = makeTestStorage({ hasItem: () => storageErr });
    const result = setAccountEmail(storage, accountId, newEmail, hashingSalt);

    expect(result).to.deep.equal(makeErr(si`Failed to check account exists: ${storageErr.reason}`));
  });
});

describe(deleteAccount.name, () => {
  it('deletes the corresponding account directory', () => {
    const removeTree = makeSpy<AppStorage['removeTree']>();
    const storage = makeTestStorage({ hasItem: () => true, removeTree });

    deleteAccount(storage, accountId);

    expect(removeTree.calls).to.deep.equal([['/accounts/test-account-id']]);
  });

  it('returns AccountNotFound when the case', () => {
    const storage = makeTestStorage({ hasItem: () => false });
    const result = deleteAccount(storage, accountId);

    expect(result).to.deep.equal(makeAccountNotFound());
  });

  it('returns the storage Err when any', () => {
    const storageErr = makeErr('Fails!');
    const storage = makeTestStorage({ hasItem: () => storageErr });
    const result = deleteAccount(storage, accountId);

    expect(result).to.deep.equal(makeErr(si`Failed to check account exists: ${storageErr.reason}`));
  });
});

function getAccountData(account: Account): AccountData {
  return {
    planId: account.planId,
    email: account.email.value,
    hashedPassword: account.hashedPassword.value,
    confirmationTimestamp: account.confirmationTimestamp,
    creationTimestamp: account.creationTimestamp,
  };
}
