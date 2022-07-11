import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makeSpy } from '../shared/test-utils';
import { LogFn, parseConfirmationLinkUrlParams } from './utils';

describe(parseConfirmationLinkUrlParams.name, () => {
  it('returns a ConfirmationLinkUrlParams value from location.search', () => {
    const subscriptionId = 'feedId-emailHash';
    const feedDisplayName = 'Just Add Light and Stir';
    const emailAddress = 'test@test.com';

    const locationSearch = [
      /** prettier: please keep these stacked */
      `id=${subscriptionId}`,
      `displayName=${feedDisplayName}`,
      `email=${emailAddress}`,
    ].join('&');

    expect(parseConfirmationLinkUrlParams(locationSearch)).to.deep.equal({
      id: subscriptionId,
      displayName: feedDisplayName,
      email: emailAddress,
    });
  });

  it('returns a descriptive Err value when any param is missing, and logs the specific missing field', () => {
    const logFn = makeSpy<LogFn>();
    const result = parseConfirmationLinkUrlParams('', logFn);

    expect(result).to.deep.equal(makeErr('Invalid confirmation link'));
    expect(logFn.calls).to.deep.equal([['Missing parameter: id']]);
  });
});
