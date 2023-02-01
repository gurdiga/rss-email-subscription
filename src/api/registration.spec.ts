import { expect } from 'chai';
import { hash } from '../shared/crypto';
import { si } from '../shared/string-utils';
import { makeTestEmailAddress } from '../shared/test-utils';
import { makeRegistrationConfirmationEmailContent, makeRegistrationConfirmationLink } from './registration';

describe(makeRegistrationConfirmationLink.name, () => {
  const domainName = 'test.feedsubscription.com';

  it('builds an URL with the blogger email’s hash in the "secret" query string param', () => {
    const email = makeTestEmailAddress('blogger@test.com');
    const appHashingSalt = 'app-hashing-salt';
    const expectedSecret = hash(email.value, si`confirmation-secret-${appHashingSalt}`);

    const url = makeRegistrationConfirmationLink(email, appHashingSalt, domainName);

    expect(url.protocol).to.equal('https:');
    expect(url.hostname).to.equal(domainName);
    expect(url.pathname).to.equal('/user/registration-confirmation.html');
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
