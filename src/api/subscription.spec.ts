import { expect } from 'chai';
import { EmailAddress, EmailHashFn, makeEmailAddress, makeHashedEmail } from '../app/email-sending/emails';
import { DOMAIN_NAME } from '../domain/feed-settings';
import { encodeSearchParamValue } from '../shared/test-utils';
import { makeConfirmationEmailContent, makeEmailConfirmationUrl } from './subscription';

describe('subscription', () => {
  const emailAddress = makeEmailAddress('a@test.com') as EmailAddress;
  const emailHashFn: EmailHashFn = (e) => `#${e.value}#`;

  describe(makeConfirmationEmailContent.name, () => {
    it('prepares the confirmation email contents', () => {
      const feedDisplayName = 'Just Add Light and Stir';
      const confirmationUrl = new URL('https://test.com/confirm');
      const listEmailAddress = makeEmailAddress('list-address@test.com') as EmailAddress;

      const emailContent = makeConfirmationEmailContent(feedDisplayName, confirmationUrl, listEmailAddress);

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

      const result = makeEmailConfirmationUrl(hashedEmail, feedId, feedDisplayName).toString();

      expect(result).to.equal(
        `https://${DOMAIN_NAME}/confirm-subscription.html` +
          `?id=${encodeSearchParamValue(feedId + '-' + hashedEmail.saltedHash)}` +
          `&displayName=${encodeSearchParamValue(feedDisplayName)}` +
          `&email=${encodeSearchParamValue(emailAddress.value)}`
      );
    });
  });
});
