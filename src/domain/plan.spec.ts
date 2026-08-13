import { expect } from 'chai';
import { isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { PlanId, makeOptionalPlanId, makePlanId } from './plan';

describe(makeOptionalPlanId.name, () => {
  // Accounts created before registration recorded the requested plan have no such field,
  // and loadAccount must not reject them.
  it('accepts absence as undefined rather than as an error', () => {
    expect(makeOptionalPlanId(undefined)).to.be.undefined;
    expect(makeOptionalPlanId(null)).to.be.undefined;
    expect(makeOptionalPlanId('')).to.be.undefined;
  });

  it('parses a present value like makePlanId does', () => {
    expect(makeOptionalPlanId('courage')).to.equal(PlanId.Courage);
    expect(isErr(makeOptionalPlanId('all-inclusive')), 'an unknown plan is still an error').to.be.true;
  });

  it('rejects a non-string that is not absent', () => {
    expect(isErr(makeOptionalPlanId(42))).to.be.true;
  });
});

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
