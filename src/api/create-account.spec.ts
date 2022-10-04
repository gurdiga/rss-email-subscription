import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { DOMAIN_NAME } from '../domain/feed-settings';
import { hash } from '../shared/crypto';
import { makeRegistrationConfirmationLink } from './create-account';

describe(makeRegistrationConfirmationLink.name, () => {
  it('builds an URL with the blogger email’s hash in the "secret" query string param', () => {
    const email = makeEmailAddress('blogger@test.com') as EmailAddress;
    const appHashingSalt = 'app-hashing-salt';
    const expectedSecret = hash(email.value, appHashingSalt);

    const url = makeRegistrationConfirmationLink(email, appHashingSalt);

    expect(url.protocol).to.equal('https:');
    expect(url.hostname).to.equal(DOMAIN_NAME);
    expect(url.pathname).to.equal('/confirm-registration.html');
    expect(url.searchParams.get('secret')).to.equal(expectedSecret);
  });
});
