import { expect } from 'chai';
import { makeInputError } from '../shared/api-response';
import { makePlanId } from './create-account';

describe('create-account', () => {
  describe('makePlanId', () => {
    it('returns an InputError value if not one of the valid plan IDs', () => {
      const planId = 'all-inclusive';

      expect(makePlanId(planId)).to.deep.equal(makeInputError(`Invalid plan ID: ${planId}`));
    });

    it('trims the input', () => {
      const planId = ' minimal \t\n';

      expect(makePlanId(planId)).to.deep.equal('minimal');
    });
  });
});
