import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { makeErr } from '../shared/lang';
import { AppStorage } from '../shared/storage';
import { makeSpy, makeStorageStub, makeStub, Spy, Stub } from '../shared/test-utils';
import { Account, AccountData, AccountId, confirmAccount, loadAccount, storeAccount } from './account';
import { HashedPassword, hashedPasswordLength, makeHashedPassword } from './hashed-password';
import { makePlanId, PlanId } from './plan';

const creationTimestamp = new Date();
const accountId: AccountId = 'some-email-hash';

describe(loadAccount.name, () => {
  it('returns an Account value for the given account ID', () => {
    const storageKey = '/account';
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      creationTimestamp,
    };
    const storage = makeStorageStub({ loadItem: () => accountData });
    const result = loadAccount(storage, accountId, storageKey);

    const expectedResult: Account = {
      email: makeEmailAddress(accountData.email) as EmailAddress,
      hashedPassword: makeHashedPassword(accountData.hashedPassword) as HashedPassword,
      plan: makePlanId(accountData.plan) as PlanId,
      creationTimestamp,
    };

    expect((storage.loadItem as Stub).calls).to.deep.equal([[storageKey]]);
    expect(result).to.deep.equal(expectedResult);
  });

  it('returns an Err value when storage fails', () => {
    const storage = makeStorageStub({ loadItem: () => makeErr('Bad sector!') });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(makeErr('Can’t storage.loadItem: Bad sector!'));
  });

  it('returns an Err value when stored email is invalid', () => {
    const accountData: AccountData = {
      plan: 'sde',
      email: 'not-an-email-really',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      creationTimestamp,
    };
    const storage = makeStorageStub({ loadItem: () => accountData });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(
      makeErr(`Invalid stored data for account ${accountId}: Email is syntactically incorrect: "not-an-email-really"`)
    );
  });

  it('returns an Err value when stored plan ID is unrecognized', () => {
    const accountData: AccountData = {
      plan: 'magic',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      creationTimestamp,
    };
    const storage = makeStorageStub({ loadItem: () => accountData });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(makeErr(`Invalid stored data for account ${accountId}: Unknown plan ID: magic`));
  });

  it('returns an Err value when stored hashed password is invalid', () => {
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'la-la-la',
      creationTimestamp,
    };
    const storage = makeStorageStub({ loadItem: () => accountData });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(
      makeErr(`Invalid stored data for account ${accountId}: Invalid hashed password length: 8`)
    );
  });
});

describe(storeAccount.name, () => {
  it('stores the given account', () => {
    const account: Account = {
      plan: 'sde',
      email: makeEmailAddress('test@test.com') as EmailAddress,
      hashedPassword: makeHashedPassword('x'.repeat(hashedPasswordLength)) as HashedPassword,
      creationTimestamp,
    };
    const storage = makeStorageStub({
      loadItem: makeStub(() => getAccountData(account)),
      storeItem: makeSpy(),
    });

    const result = storeAccount(storage, accountId, account);

    expect((storage.storeItem as Spy).calls).to.deep.equal([
      [`/accounts/${accountId}/account.json`, getAccountData(account)],
    ]);
    expect(result).to.be.undefined;
  });

  function getAccountData(account: Account): AccountData {
    return {
      plan: account.plan,
      email: account.email.value,
      hashedPassword: account.hashedPassword.value,
      confirmationTimestamp: account.confirmationTimestamp,
      creationTimestamp: account.creationTimestamp,
    };
  }
});

describe(confirmAccount.name, () => {
  it('sets confirmationTimestamp on the given account', () => {
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      creationTimestamp,
    };

    const loadItem = makeStub(() => accountData);
    const storeItem = makeSpy<AppStorage['storeItem']>();
    const storage = makeStorageStub({
      loadItem: loadItem,
      storeItem: storeItem,
    });

    const confirmationTimestamp = new Date('2022-10-07');

    const result = confirmAccount(storage, accountId, () => confirmationTimestamp);

    const expectedStoredData: AccountData = {
      plan: accountData.plan,
      email: accountData.email,
      hashedPassword: accountData.hashedPassword,
      confirmationTimestamp,
      creationTimestamp,
    };

    expect(loadItem.calls).to.deep.equal([[`/accounts/${accountId}/account.json`]]);
    expect(storeItem.calls).to.deep.equal([[`/accounts/${accountId}/account.json`, expectedStoredData]]);
    expect(result).to.be.undefined;
  });
});
