import { expect } from 'chai';
import { makeReturnPath } from './email-delivery';

describe(makeReturnPath.name, () => {
  it('returns something', () => {
    const actualResult = makeReturnPath('a@test.com', 'abc123');
    const expectedResult = 'bounced-abc123-a=test.com@bounces.feedsubscription.com';

    expect(actualResult).to.equal(expectedResult);
  });
});
