import { expect } from 'chai';
import { parseConfirmationLinkUrlParams } from './utils';

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
});
