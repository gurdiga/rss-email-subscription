import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makePlanId } from './plan';

describe(makePlanId.name, () => {
  it('returns a PlanId value for valid input, and an Err otherwise', () => {
    expect(makePlanId('sde')).to.equal('sde');
    expect(makePlanId('all-inclusive')).to.deep.equal(makeErr('Unknown plan ID: all-inclusive'));
    expect(makePlanId(null!)).to.deep.equal(makeErr('Invalid plan ID: missing value'));
  });
});
