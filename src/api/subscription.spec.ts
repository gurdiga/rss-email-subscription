import { expect } from 'chai';
import { EmailAddress, EmailHashFn, makeEmailAddress, makeHashedEmail } from '../app/email-sending/emails';
import { encodeSearchParamValue } from '../shared/test-utils';
import { makeSubscriptionConfirmationEmailContent, makeEmailConfirmationUrl } from './subscription';

describe('subscription', () => {
  const domainName = 'test.feedsubscription.com';
  const emailAddress = makeEmailAddress('a@test.com') as EmailAddress;
  const emailHashFn: EmailHashFn = (e) => `#${e.value}#`;

  describe(makeSubscriptionConfirmationEmailContent.name, () => {
    it('prepares the confirmation email contents', () => {
      const feedDisplayName = 'Just Add Light and Stir';
      const confirmationUrl = new URL('https://test.com/confirm');
      const listEmailAddress = makeEmailAddress('list-address@test.com') as EmailAddress;

      const emailContent = makeSubscriptionConfirmationEmailContent(feedDisplayName, confirmationUrl, listEmailAddress);

      expect(emailContent.subject).to.equal('Please confirm feed subscription');
      expect(emailContent.htmlBody).to.include(`<a href="${confirmationUrl}">`);
      expect(emailContent.htmlBody).to.include(feedDisplayName);
      expect(emailContent.htmlBody).to.include(listEmailAddress.value);
    });
  });

  describe(makeEmailConfirmationUrl.name, () => {
    it('returns the email confirmation URL', () => {
      const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);
      const feedId = 'justaddlightandstir';
      const feedDisplayName = 'Just Add Light and Stir';

      const result = makeEmailConfirmationUrl(hashedEmail, feedId, feedDisplayName, domainName).toString();

      expect(result).to.equal(
        `https://${domainName}/subscription-confirmation.html` +
          `?id=${encodeSearchParamValue(feedId + '-' + hashedEmail.saltedHash)}` +
          `&displayName=${encodeSearchParamValue(feedDisplayName)}` +
          `&email=${encodeSearchParamValue(emailAddress.value)}`
      );
    });
  });
});
