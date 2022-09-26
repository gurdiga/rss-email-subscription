import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { makeErr } from '../shared/lang';
import { makeStorageStub, Stub } from '../shared/test-utils';
import { AccountData, loadAccount } from './account';
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
      makeErr('Invalid email while loading account 123: Syntactically invalid email: "not-an-email-really"')
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
