import { expect } from 'chai';
import { EmailAddress, HashedEmail, isEmailAddress, makeEmailAddress, makeHashedEmail } from '../email-sending/emails';
import { makeErr } from '../shared/lang';
import { makeStub } from '../shared/test-utils';
import { removeEmail } from './unsubscription';

describe(removeEmail.name, () => {
  const emailAddresses = [
    /* prettier: Please keep these stacked. Pretty please! */
    'a@test.com',
    'b@test.com',
    'c@test.com',
    'd@test.com',
  ]
    .map(makeEmailAddress)
    .filter(isEmailAddress);
  const emailHashFn = makeStub((x: EmailAddress) => `##${x.value}##`);
  const hashedEmails = emailAddresses.map((x) => makeHashedEmail(x, emailHashFn));

  it('removes the email with the corresponding hash from the given list', () => {
    const emailAddressToRemove = emailAddresses[2];
    const hash = emailHashFn(emailAddressToRemove);

    const newHashedEmails = removeEmail(hashedEmails, hash) as HashedEmail[];

    expect(newHashedEmails.map((x) => x.saltedHash)).not.to.include(hash);
  });

  it('returns an Err value if the hash is an empty string or whitespace', () => {
    const expectedErr = makeErr('Email hash is an empty string or whitespace');

    expect(removeEmail(hashedEmails, '')).to.deep.equal(expectedErr);
    expect(removeEmail(hashedEmails, '  \t')).to.deep.equal(expectedErr);
    expect(removeEmail(hashedEmails, '\n  ')).to.deep.equal(expectedErr);
  });
});
