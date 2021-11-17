import { expect } from 'chai';
import { EmailAddress, HashedEmail, isEmailAddress, makeEmailAddress, makeHashedEmail } from '../email-sending/emails';
import { makeDataDir } from '../shared/data-dir';
import { makeErr } from '../shared/lang';
import { makeStub } from '../shared/test-utils';
import { parseUnsubscriptionId, removeEmail } from './unsubscription';

describe(parseUnsubscriptionId.name, () => {
  const dataDirRoot = '/some/root/path';

  it('parses a feedId-emailHash tuple', () => {
    const emailHash = '6968c45bb2091e472b299923b254f5a2780941ab2d6b1f6e0d27ee356ee30e44';
    const feedId = 'seths';
    const id = `${feedId}-${emailHash}`;

    expect(parseUnsubscriptionId(id, dataDirRoot)).to.deep.equal({
      dataDir: makeDataDir(feedId, dataDirRoot),
      emailHash,
    });
  });

  it('properly handles dashed in feedId', () => {
    const emailHash = '6968c45bb2091e472b299923b254f5a2780941ab2d6b1f6e0d27ee356ee30e44';
    const feedId = 'css-tricks';
    const id = `${feedId}-${emailHash}`;

    expect(parseUnsubscriptionId(id, dataDirRoot)).to.deep.equal({
      dataDir: makeDataDir(feedId, dataDirRoot),
      emailHash,
    });
  });

  it('returns an Err value when can’t ID doesn’t match the format', () => {
    const id = `missisipi`;

    expect(parseUnsubscriptionId(id, dataDirRoot)).to.deep.equal(makeErr(`Invalid unsubscription ID`));
  });

  it('returns an Err value when unsubscription ID is not a string', () => {
    const id = 42;

    expect(parseUnsubscriptionId(id, dataDirRoot)).to.deep.equal(makeErr('Unsubscription ID is not a string'));
  });
});

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

    const newHashedEmails = removeEmail(hash, hashedEmails) as HashedEmail[];

    expect(newHashedEmails.map((x) => x.saltedHash)).not.to.include(hash);
  });

  it('returns an Err value if the hash is an empty string or whitespace', () => {
    const expectedErr = makeErr('Email hash is an empty string or whitespace');

    expect(removeEmail('', hashedEmails)).to.deep.equal(expectedErr);
    expect(removeEmail('  \t', hashedEmails)).to.deep.equal(expectedErr);
    expect(removeEmail('\n  ', hashedEmails)).to.deep.equal(expectedErr);
  });
});
