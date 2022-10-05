import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { DOMAIN_NAME } from '../domain/feed-settings';
import { hash } from '../shared/crypto';
import { makeRegistrationConfirmationEmailContent, makeRegistrationConfirmationLink } from './registration';

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

describe(makeRegistrationConfirmationEmailContent.name, () => {
  it('builds an email message containing the given confirmation link', () => {
    const confirmationLink = new URL('https://confirmation.link');
    const emailContent = makeRegistrationConfirmationEmailContent(confirmationLink);

    expect(emailContent.subject).to.equal('Please confirm FeedSubscription registration');
    expect(emailContent.htmlBody).to.include(confirmationLink.toString());
  });
});
