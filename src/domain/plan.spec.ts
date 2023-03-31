import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makePlanId } from './plan';

describe(makePlanId.name, () => {
  it('returns a PlanId value for valid input, and an Err otherwise', () => {
    expect(makePlanId('sde')).to.equal('sde');
    expect(makePlanId('all-inclusive')).to.deep.equal(makeErr('Unknown plan ID: all-inclusive', 'planId'));
    expect(makePlanId(null!)).to.deep.equal(makeErr('Invalid plan ID: missing value', 'planId'));
  });

  it('returns an Err value if not one of the valid plan IDs', () => {
    const planId = 'all-inclusive';

    expect(makePlanId(planId)).to.deep.equal(makeErr(si`Unknown plan ID: ${planId}`, 'planId'));
  });

  it('trims the input', () => {
    const planId = ' free \t\n';

    expect(makePlanId(planId)).to.deep.equal('free');
  });
});
