import { expect } from 'chai';
import {
  EmailAddress,
  EmailHashFn,
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
      const result = storeEmails(newEmails, dataDir, writeFileFn);

      expect(result).to.be.undefined;
      expect(writeFileFn.calls).to.deep.equal([
        [
          `${dataDir.value}/emails.json`,
          JSON.stringify({
            [hashedEmail.saltedHash]: hashedEmail.emailAddress.value,
          }),
        ],
      ]);
    });

    it('reports file write errors', () => {
      const error = new Error('No space on disk');
      const writeFileFn = makeThrowingStub<WriteFileFn>(error);

      const result = storeEmails(newEmails, dataDir, writeFileFn);

      expect(result).to.deep.equal(makeErr(`Could not store emails: ${error.message}`));
    });
  });

  describe(makeConfirmationEmailContent.name, () => {
    it('prepares the confirmation email contents', () => {
      const email = makeEmailAddress('a@test.com') as EmailAddress;
      const emailContent = makeConfirmationEmailContent(email) as EmailContent;
      // const confirmationLink = makeEmailConfirmationUrl(email) as URL;

      expect(emailContent.subject).to.equal('Please confirm feed subscription');
      // TODO: Finish this
      //expect(emailContent.htmlBody).to.include(confirmationLink.toString());
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
