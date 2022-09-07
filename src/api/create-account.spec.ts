import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makePlanId } from './create-account';

describe('create-account', () => {
  describe('makePlanId', () => {
    it('returns an Err value if not one of the valid plan IDs', () => {
      const planId = 'all-inclusive';

      expect(makePlanId(planId)).to.deep.equal(makeErr(`Invalid plan ID: ${planId}`));
    });

    it('trims the input', () => {
      const planId = ' minimal \t\n';

      expect(makePlanId(planId)).to.deep.equal('minimal');
    });
  });
});
