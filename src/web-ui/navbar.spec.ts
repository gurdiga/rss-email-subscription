import { expect } from 'chai';
import { getCookieByName } from './navbar';

describe(getCookieByName.name, () => {
  it('returns a cookie’s value by name or empty string if not found', () => {
    const cookieRequestHeader = 'displayPrivateNavbar=true; testName=with spaces';

    expect(getCookieByName('displayPrivateNavbar', cookieRequestHeader)).to.equal('true');
    expect(getCookieByName('testName', cookieRequestHeader)).to.equal('with spaces');
    expect(getCookieByName('magics', cookieRequestHeader)).to.equal('');
  });
});
