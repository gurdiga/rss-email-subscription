import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { AccountId } from './account';
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
    expect(makeAccountId(42 as any as string)).to.deep.equal(makeErr('Not a string: number "42"'));
  });
});
