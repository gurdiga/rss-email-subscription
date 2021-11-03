import { expect } from 'chai';
import { EmailAddress, EmailHashFn, makeEmailAddress, makeHashedEmail, StoredEmails } from '../email-sending/emails';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { WriteFileFn } from '../shared/io';
import { makeSpy } from '../shared/test-utils';
import { addEmail, storeEmails } from './subscription';

describe('subscription', () => {
  const emailAddress = makeEmailAddress('a@test.com') as EmailAddress;
  const emailHashFn: EmailHashFn = (e) => `#${e.value}#`;

  describe(addEmail.name, () => {
    it('adds an email address to a StoredEmails', () => {
      const storedEmails: StoredEmails = {
        validEmails: [],
        invalidEmails: [],
      };

      const newEmails = addEmail(emailAddress, storedEmails, emailHashFn);

      expect(newEmails.validEmails).to.have.lengthOf(1);
      expect(newEmails.validEmails[0]).to.deep.equal({
        kind: 'HashedEmail',
        emailAddress: emailAddress,
        saltedHash: emailHashFn(emailAddress),
      });
      expect(newEmails.invalidEmails).to.be.empty;
    });
  });

  describe(storeEmails.name, () => {
    it('stores a StoredEmails to a DataDir', () => {
      const hashedEmail = makeHashedEmail(emailAddress, emailHashFn);
      const newEmails: StoredEmails = {
        validEmails: [hashedEmail],
        invalidEmails: ['not-an-email'],
      };
      const dataDir: DataDir = makeDataDir('/test/feed-data-dir') as DataDir;
      const writeFileFn = makeSpy<WriteFileFn>();

      const result = storeEmails(newEmails, dataDir, writeFileFn); // TODO

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
  });
});
