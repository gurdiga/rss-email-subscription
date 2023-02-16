import { expect } from 'chai';
import { makeTestEmailAddress } from '../shared/test-utils';
import { getAccountIdByEmail } from './account-crypto';

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
