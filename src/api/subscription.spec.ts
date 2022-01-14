import { expect } from 'chai';
import {
  EmailAddress,
  EmailHashFn,
  EmailIndex,
  HashedEmail,
  makeEmailAddress,
  makeHashedEmail,
  StoredEmails,
} from '../email-sending/emails';
import { EmailContent } from '../email-sending/item-sending';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { DOMAIN_NAME } from '../shared/feed-settings';
import { WriteFileFn } from '../shared/io';
import { makeErr } from '../shared/lang';
import { encodeSearchParamValue, makeSpy, makeThrowingStub } from '../shared/test-utils';
import { addEmail, makeConfirmationEmailContent, makeEmailConfirmationUrl, storeEmails } from './subscription';

describe('subscription', () => {
  const emailAddress = makeEmailAddress('a@test.com') as EmailAddress;
  const emailHashFn: EmailHashFn = (e) => `#${e.value}#`;

  describe(addEmail.name, () => {
    it('adds an email address to a StoredEmails', () => {
      const storedEmails: StoredEmails = {
        validEmails: [],
        invalidEmails: [],
      };

      const newEmails = addEmail(storedEmails, emailAddress, emailHashFn);
      const expectedHashedEmail: HashedEmail = {
        kind: 'HashedEmail',
        emailAddress: emailAddress,
        saltedHash: emailHashFn(emailAddress),
        isConfirmed: false,
      };

      expect(newEmails.validEmails).to.have.lengthOf(1);
      expect(newEmails.validEmails[0]).to.deep.equal(expectedHashedEmail);
      expect(newEmails.invalidEmails).to.be.empty;
    });
  });

  describe(storeEmails.name, () => {
    const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);
    const newEmails: StoredEmails = {
      validEmails: [hashedEmail],
      invalidEmails: ['not-an-email'],
    };
    const dataDir: DataDir = makeDataDir('/test/feed-data-dir') as DataDir;

    it('stores a StoredEmails to a DataDir', () => {
      const writeFileFn = makeSpy<WriteFileFn>();
      const result = storeEmails(newEmails.validEmails, dataDir, writeFileFn);

      const expectedData: EmailIndex = {
        [hashedEmail.saltedHash]: {
          emailAddress: hashedEmail.emailAddress.value,
          isConfirmed: hashedEmail.isConfirmed,
        },
      };

      expect(result).to.be.undefined;
      expect(writeFileFn.calls).to.deep.equal([[`${dataDir.value}/emails.json`, JSON.stringify(expectedData)]]);
    });

    it('reports file write errors', () => {
      const error = new Error('No space on disk');
      const writeFileFn = makeThrowingStub<WriteFileFn>(error);

      const result = storeEmails(newEmails.validEmails, dataDir, writeFileFn);

      expect(result).to.deep.equal(makeErr(`Could not store emails: ${error.message}`));
    });
  });

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
        `https://${DOMAIN_NAME}/confirm.html` +
          `?id=${encodeSearchParamValue(feedId + '-' + hashedEmail.saltedHash)}` +
          `&displayName=${encodeSearchParamValue(feedDisplayName)}` +
          `&email=${encodeSearchParamValue(emailAddress.value)}`
      );
    });
  });
});
