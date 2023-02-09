import { expect } from 'chai';
import { hashLength } from '../shared/crypto';
import { Err, makeErr } from '../shared/lang';
import { AppStorage } from '../storage/storage';
import { si } from '../shared/string-utils';
import { makeSpy, makeTestStorage, makeStub, makeTestAccountId, Spy, Stub } from '../shared/test-utils';
import { makeTestEmailAddress } from '../shared/test-utils';
import { Account, AccountData, AccountId, AccountIdList, confirmAccount, getAccountIdByEmail } from './account';
import { getAccountIdList, getAccountStorageKey } from './account';
import { loadAccount, makeAccountId, storeAccount } from './account';
import { HashedPassword, hashedPasswordLength, makeHashedPassword } from './hashed-password';
import { makePlanId, PlanId } from './plan';

const creationTimestamp = new Date();
const accountId = makeTestAccountId();

describe(loadAccount.name, () => {
  it('returns an Account value for the given account ID', () => {
    const storageKey = '/account';
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      creationTimestamp,
    };
    const storage = makeTestStorage({ loadItem: () => accountData });
    const result = loadAccount(storage, accountId, storageKey);

    const expectedResult: Account = {
      email: makeTestEmailAddress(accountData.email),
      hashedPassword: makeHashedPassword(accountData.hashedPassword) as HashedPassword,
      plan: makePlanId(accountData.plan) as PlanId,
      creationTimestamp,
    };

    expect((storage.loadItem as Stub).calls).to.deep.equal([[storageKey]]);
    expect(result).to.deep.equal(expectedResult);
  });

  it('returns an Err value when storage fails', () => {
    const storage = makeTestStorage({ loadItem: () => makeErr('Bad sector!') });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(makeErr('Failed to load account data: Bad sector!'));
  });

  it('returns an Err value when stored email is invalid', () => {
    const accountData: AccountData = {
      plan: 'sde',
      email: 'not-an-email-really',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      creationTimestamp,
    };
    const storage = makeTestStorage({ loadItem: () => accountData });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(
      makeErr(
        si`Invalid stored data for account ${accountId.value}: Email is syntactically incorrect: "not-an-email-really"`,
        'email'
      )
    );
  });

  it('returns an Err value when stored plan ID is unrecognized', () => {
    const accountData: AccountData = {
      plan: 'magic',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
      creationTimestamp,
    };
    const storage = makeTestStorage({ loadItem: () => accountData });
    const result = loadAccount(storage, accountId);

    expect(result).to.deep.equal(
      makeErr(si`Invalid stored data for account ${accountId.value}: Unknown plan ID: magic`, 'plan')
    );
  });

  it('returns an Err value when stored hashed password is invalid', () => {
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'la-la-la',
      creationTimestamp,
    };
    const storage = makeTestStorage({ loadItem: () => accountData });
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
  it('stores the given account', () => {
    const account: Account = {
      plan: 'sde',
      email: makeTestEmailAddress('test@test.com'),
      hashedPassword: makeHashedPassword('x'.repeat(hashedPasswordLength)) as HashedPassword,
      creationTimestamp,
    };
    const storage = makeTestStorage({
      loadItem: makeStub(() => getAccountData(account)),
      storeItem: makeSpy(),
    });

    const result = storeAccount(storage, accountId, account);

    expect((storage.storeItem as Spy).calls).to.deep.equal([
      [getAccountStorageKey(accountId), getAccountData(account)],
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
    const storage = makeTestStorage({
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

    expect(loadItem.calls).to.deep.equal([[getAccountStorageKey(accountId)]]);
    expect(storeItem.calls).to.deep.equal([[getAccountStorageKey(accountId), expectedStoredData]]);
    expect(result).to.be.undefined;
  });
});

describe(makeAccountId.name, () => {
  it('returns an AccountId value when all good', () => {
    const input = 'x'.repeat(64);
    const expectedResult: AccountId = {
      kind: 'AccountId',
      value: 'x'.repeat(64),
    };

    expect(makeAccountId(input)).to.deep.equal(expectedResult);
  });

  it('returns an Err value when not so good', () => {
    expect(makeAccountId('1')).to.deep.equal(makeErr('Expected to be a 64-character hex hash: string "1"'));
  });
});

describe(getAccountIdByEmail.name, () => {
  it('returns a 64-character hex hash of the given email', () => {
    const email = makeTestEmailAddress('test@test.com');
    const result = getAccountIdByEmail(email, 'test-secret-salt');

    expect(result).to.deep.equal({
      kind: 'AccountId',
      value: '1a3f1d35ee5d00cc82044803851b76380a96f4a228b952c9dc71de68cbb716dd',
    });
  });
});

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
      .map((letter) => letter.repeat(hashLength))
      .map(makeAccountId) as AccountId[];
    const validAccountIdStrings = accountIds.map((x) => x.value);

    const invalidAccountIdStrings = ['42', 'bad-account-id'];
    const errs = invalidAccountIdStrings.map(makeAccountId) as Err[];

    const subdirectoryNames = [...validAccountIdStrings, ...invalidAccountIdStrings];
    const storage = makeTestStorage({ listSubdirectories: () => subdirectoryNames });

    expect(getAccountIdList(storage)).to.deep.equal(<AccountIdList>{ accountIds, errs });
  });
});
