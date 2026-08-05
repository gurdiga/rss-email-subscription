import { expect } from 'chai';
import { PagePath } from '../domain/page-path';
import { si } from '../shared/string-utils';
import { makeTestConfirmationSecret } from '../shared/test-utils';
import { makeRegistrationConfirmationEmailContent } from './registration';

const domainName = 'unit-test.feedsubscription.com';

describe(makeRegistrationConfirmationEmailContent.name, () => {
  it('builds an email message containing the given confirmation link', () => {
    const confirmationSecret = makeTestConfirmationSecret();
    const confirmationLink = si`https://${domainName}${PagePath.registrationConfirmation}?secret=${confirmationSecret.value}`;
    const emailContent = makeRegistrationConfirmationEmailContent(confirmationSecret, domainName);

    expect(emailContent.subject).to.equal('Please confirm FeedSubscription.com registration');
    expect(emailContent.htmlBody).to.include(confirmationLink);
  });
});
