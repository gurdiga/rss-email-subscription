import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
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
});
