import { expect } from 'chai';
import { EmailAddress, EmailHashFn, makeEmailAddress, makeHashedEmail } from '../app/email-sending/emails';
import { FeedId, makeFeedId } from '../domain/feed';
import { si } from '../shared/string-utils';
import { encodeSearchParamValue } from '../shared/test-utils';
import { makeSubscriptionConfirmationEmailContent, makeEmailConfirmationUrl } from './subscription';

describe('subscription', () => {
  const domainName = 'test.feedsubscription.com';
  const emailAddress = makeEmailAddress('a@test.com') as EmailAddress;
  const emailHashFn: EmailHashFn = (e) => si`#${e.value}#`;

  describe(makeSubscriptionConfirmationEmailContent.name, () => {
    it('prepares the confirmation email contents', () => {
      const feedDisplayName = 'Just Add Light and Stir';
      const confirmationUrl = new URL('https://test.com/confirm');
      const listEmailAddress = makeEmailAddress('list-address@test.com') as EmailAddress;

      const emailContent = makeSubscriptionConfirmationEmailContent(feedDisplayName, confirmationUrl, listEmailAddress);

      expect(emailContent.subject).to.equal('Please confirm feed subscription');
      expect(emailContent.htmlBody).to.include(si`<a href="${confirmationUrl.toString()}">`);
      expect(emailContent.htmlBody).to.include(feedDisplayName);
      expect(emailContent.htmlBody).to.include(listEmailAddress.value);
    });
  });

  describe(makeEmailConfirmationUrl.name, () => {
    it('returns the email confirmation URL', () => {
      const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);
      const feedId = makeFeedId('justaddlightandstir') as FeedId;
      const feedDisplayName = 'Just Add Light and Stir';

      const result = makeEmailConfirmationUrl(hashedEmail, feedId, feedDisplayName, domainName).toString();
      const id = si`${feedId.value}-${hashedEmail.saltedHash}`;

      expect(result).to.equal(
        si`https://${domainName}/subscription-confirmation.html` +
          si`?id=${encodeSearchParamValue(id)}` +
          si`&displayName=${encodeSearchParamValue(feedDisplayName)}` +
          si`&email=${encodeSearchParamValue(emailAddress.value)}`
      );
    });
  });
});
