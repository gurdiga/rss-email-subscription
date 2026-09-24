import { expect } from 'chai';
import { EmailHashFn, loadEmailAddresses, makeHashedEmail } from '../app/email-sending/emails';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { storeFeed } from '../domain/feed-storage';
import { isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  encodeSearchParamValue,
  makeTestEmailAddress,
  makeTestFeed,
  makeTestFeedId,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { hashingSalt, makeMockRegenerateSession, makeTestApp } from './test-utils';
import { makeSubscriptionConfirmationEmailContent, makeEmailConfirmationUrl, subscription } from './subscription';

describe('subscription', () => {
  const domainName = 'test.feedsubscription.com';
  const emailAddress = makeTestEmailAddress('a@test.com');
  const emailHashFn: EmailHashFn = (e) => si`#${e.value}#`;

  describe(subscription.name, () => {
    afterEach(purgeTestStorageFromSnapshot);

    it('rejects a comma-injected email instead of storing it as one subscriber', async () => {
      const app = makeTestApp();
      const feed = makeTestFeed();
      const accountId = getAccountIdByEmail(makeTestEmailAddress('feed-owner@test.com'), hashingSalt);
      const storeFeedResult = storeFeed(accountId, feed, app.storage);
      expect(isErr(storeFeedResult)).to.be.false;

      const reqBody = { email: 'a@x.com,b@y.com', feedId: feed.id.value };
      const response = await subscription('req', reqBody, {}, {}, app, makeMockRegenerateSession({}));

      expect(response.kind).to.equal('InputError', JSON.stringify(response));

      const storedEmails = loadEmailAddresses(accountId, feed.id, app.storage);
      expect(isErr(storedEmails)).to.be.false;
      expect((storedEmails as any).validEmails).to.deep.equal([]);
    });
  });

  describe(makeSubscriptionConfirmationEmailContent.name, () => {
    it('prepares the confirmation email contents', () => {
      const feedDisplayName = 'Just Add Light and Stir';
      const confirmationUrl = new URL('https://test.com/confirm');
      const listEmailAddress = makeTestEmailAddress('list-address@test.com');

      const emailContent = makeSubscriptionConfirmationEmailContent(feedDisplayName, confirmationUrl, listEmailAddress);

      expect(emailContent.subject).to.equal('Please confirm subscription');
      expect(emailContent.htmlBody).to.include(si`<a href="${confirmationUrl.toString()}">`);
      expect(emailContent.htmlBody).to.include(feedDisplayName);
      expect(emailContent.htmlBody).to.include(listEmailAddress.value);
    });
  });

  describe(makeEmailConfirmationUrl.name, () => {
    it('returns the email confirmation URL', () => {
      const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);
      const feedId = makeTestFeedId();
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
