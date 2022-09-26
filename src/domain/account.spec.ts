import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { AppStorage, makeStorage } from '../shared/storage';
import { makeStub } from '../shared/test-utils';
import { AccountData, loadAccount } from './account';
import { HashedPassword, hashedPasswordLength, makeHashedPassword } from './hashed-password';

describe(loadAccount.name, () => {
  const storage = makeStorage('/test-data');

  it('returns an Account value for the given account ID', () => {
    const storageKey = '/account';
    const accountData: AccountData = {
      plan: 'sde',
      email: 'test@test.com',
      hashedPassword: 'x'.repeat(hashedPasswordLength),
    };
    const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => accountData) };
    const result = loadAccount(storageStub, 123, storageKey);

    expect(storageStub.loadItem.calls).to.deep.equal([[storageKey]]);
    expect(result).to.deep.equal({
      email: makeEmailAddress(accountData.email) as EmailAddress,
      hashedPassword: makeHashedPassword(accountData.hashedPassword) as HashedPassword,
      plan: accountData.plan,
    });
  });
});
