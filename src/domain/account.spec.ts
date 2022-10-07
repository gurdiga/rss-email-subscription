import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { makeErr } from '../shared/lang';
import { makeSpy, makeStorageStub, makeStub, Spy, Stub } from '../shared/test-utils';
import { Account, AccountData, confirmAccount, loadAccount, storeAccount } from './account';
import { HashedPassword, hashedPasswordLength, makeHashedPassword } from './hashed-password';

describe(loadAccount.name, () => {
  it('returns an Account value for the given account ID', () => {
    const storageKey = '/account';
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
    };
    const storage = makeStorageStub({ loadItem: () => accountData });
    const result = loadAccount(storage, 123, storageKey);

    expect((storage.loadItem as Stub).calls).to.deep.equal([[storageKey]]);
    expect(result).to.deep.equal({
      email: makeEmailAddress(accountData.email) as EmailAddress,
      hashedPassword: makeHashedPassword(accountData.hashedPassword) as HashedPassword,
      plan: accountData.plan,
    });
  });

  it('returns an Err value when storage fails', () => {
    const storage = makeStorageStub({ loadItem: () => makeErr('Bad disc sector!') });
    const result = loadAccount(storage, 123);

    expect(result).to.deep.equal(makeErr('Can’t load account data: Bad disc sector!'));
  });

  it('returns an Err value when stored email is invalid', () => {
    const accountData: AccountData = {
      plan: 'sde',
      email: 'not-an-email-really',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
    };
    const storage = makeStorageStub({ loadItem: () => accountData });
    const result = loadAccount(storage, 123);

    expect(result).to.deep.equal(
      makeErr('Invalid email while loading account 123: Email is syntactically incorrect: "not-an-email-really"')
    );
  });

  it('returns an Err value when stored plan ID is unrecognized', () => {
    const accountData: AccountData = {
      plan: 'magic',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
    };
    const storage = makeStorageStub({ loadItem: () => accountData });
    const result = loadAccount(storage, 123);

    expect(result).to.deep.equal(makeErr('Invalid plan ID while loading account 123: Unknown plan ID: magic'));
  });

  it('returns an Err value when stored hashed password is invalid', () => {
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'la-la-la',
    };
    const storage = makeStorageStub({ loadItem: () => accountData });
    const result = loadAccount(storage, 123);

    expect(result).to.deep.equal(
      makeErr('Invalid hashed password while loading account 123: Invalid hashed password length: 8')
    );
  });
});

describe(storeAccount.name, () => {
  it('stores the given account', () => {
    const accountId = 42;

    const account: Account = {
      plan: 'sde',
      email: makeEmailAddress('test@test.com') as EmailAddress,
      hashedPassword: makeHashedPassword('x'.repeat(hashedPasswordLength)) as HashedPassword,
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
    };
  }
});

describe(confirmAccount.name, () => {
  it('sets confirmationTimestamp on the given account', () => {
    const accountId = 42;
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
    };
    const storage = makeStorageStub({
      loadItem: makeStub(() => accountData),
      storeItem: makeSpy(),
    });
    const currentTimestamp = new Date('2022-10-07');

    const result = confirmAccount(storage, accountId, () => currentTimestamp);

    expect((storage.loadItem as Stub).calls).to.deep.equal([['/accounts/42/account.json']]);
    expect((storage.storeItem as Stub).calls).to.deep.equal([
      [
        '/accounts/42/account.json',
        <AccountData>{
          plan: accountData.plan,
          email: accountData.email,
          hashedPassword: accountData.hashedPassword,
          confirmationTimestamp: currentTimestamp,
        },
      ],
    ]);
    expect(result).to.be.undefined;
  });
});
