import { expect } from 'chai';
import { makeReturnPath } from './email-delivery';

describe(makeReturnPath.name, () => {
  it('returns SMTP return-path for the given email', () => {
    const uid = 1234567890;
    const actualResult = makeReturnPath('a@test.com', 'test.feedsubscription.com', uid);
    const expectedResult = 'bounced-1234567890-a=test.com@test.feedsubscription.com';

    expect(actualResult).to.equal(expectedResult);
  });
});
