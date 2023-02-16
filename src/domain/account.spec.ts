import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makeTestEmailAddress } from '../shared/test-utils';
import { AccountId, getAccountIdByEmail } from './account';
import { makeAccountId } from './account';

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
