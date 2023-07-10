import { expect } from 'chai';
import { PagePath } from '../domain/page-path';
import { si } from '../shared/string-utils';
import { makeTestEmailAddress } from '../shared/test-utils';
import { makeRegistrationConfirmationEmailContent } from './registration';

const domainName = 'unit-test.feedsubscription.com';

describe(makeRegistrationConfirmationEmailContent.name, () => {
  it('builds an email message containing the given confirmation link', () => {
    const email = makeTestEmailAddress('email@test.com');
    const appHashingSalt = 'app-hashing-salt';
    const confirmationLink = si`https://${domainName}${PagePath.registrationConfirmation}?secret=2df199d041341a6fbc810f49d16a5362b1b74e1e9ef612a8141691479689c378`;
    const emailContent = makeRegistrationConfirmationEmailContent(email, appHashingSalt, domainName);

    expect(emailContent.subject).to.equal('Please confirm FeedSubscription.com registration');
    expect(emailContent.htmlBody).to.include(confirmationLink);
  });
});
