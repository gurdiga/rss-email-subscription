import { expect } from 'chai';
import {
  EmailAddress,
  EmailHashFn,
  HashedEmail,
  makeEmailAddress,
  makeHashedEmail,
  StoredEmails,
} from '../email-sending/emails';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { WriteFileFn } from '../shared/io';
import { makeErr } from '../shared/lang';
import { makeSpy, makeThrowingStub } from '../shared/test-utils';
import { addEmail, sendConfirmationEmail, storeEmails } from './subscription';

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

  describe(sendConfirmationEmail.name, () => {
    it('exists', () => {
      expect(sendConfirmationEmail).to.exist;
    });
  });
});
