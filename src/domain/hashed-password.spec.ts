import { expect } from 'chai';
import { hash } from '../shared/crypto';
import { isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { HashedPassword, hashPassword, makeHashedPassword, verifyPassword } from './hashed-password';

const legacySalt = 'test-hashing-salt';

describe(makeHashedPassword.name, () => {
  it('accepts a legacy 64-char hex digest', () => {
    const legacy = hash('password', legacySalt);

    expect(isErr(makeHashedPassword(legacy))).to.be.false;
  });

  it('accepts the new self-describing scrypt format', async () => {
    const hashed = await hashPassword('a-good-long-password');

    expect(hashed.value).to.match(/^scrypt\$v1\$N=\d+,r=\d+,p=\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(isErr(makeHashedPassword(hashed.value))).to.be.false;
  });

  it('rejects non-string and malformed values', () => {
    expect(isErr(makeHashedPassword(42 as any))).to.be.true;
    expect(isErr(makeHashedPassword('la-la-la'))).to.be.true;
    expect(isErr(makeHashedPassword('X'.repeat(64)))).to.be.true; // 64 chars but not hex
    expect(isErr(makeHashedPassword('scrypt$v1$N=16384,r=8,p=1$nothex$deadbeef'))).to.be.true;
  });

  // An odd-length digest used to pass the shape check and then make scrypt throw on a
  // fractional key length, rather than failing to verify.
  it('rejects a scrypt value whose salt or digest is not the exact v1 length', () => {
    const salt = 'a'.repeat(32);
    const digest = 'b'.repeat(128);

    expect(isErr(makeHashedPassword(si`scrypt$v1$N=32768,r=8,p=1$${salt}$${digest}`)), 'exact lengths').to.be.false;
    expect(isErr(makeHashedPassword(si`scrypt$v1$N=32768,r=8,p=1$a$b`)), 'odd single-char').to.be.true;
    expect(isErr(makeHashedPassword(si`scrypt$v1$N=32768,r=8,p=1$${salt}$${digest}b`)), 'digest too long').to.be.true;
    expect(isErr(makeHashedPassword(si`scrypt$v1$N=32768,r=8,p=1$${salt}a$${digest}`)), 'salt too long').to.be.true;
  });
});

describe(hashPassword.name, () => {
  it('produces a different digest each time (random per-user salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');

    expect(a.value).to.not.equal(b.value);
  });
});

describe(verifyPassword.name, () => {
  it('verifies a password against a new-format hash without requesting a rehash', async () => {
    const stored = await hashPassword('correct horse battery staple');

    const match = await verifyPassword('correct horse battery staple', stored, legacySalt);
    expect(match.isMatch).to.be.true;
    expect(match.needsRehash).to.be.false;

    const wrong = await verifyPassword('wrong password', stored, legacySalt);
    expect(wrong.isMatch).to.be.false;
    expect(wrong.needsRehash).to.be.false;
  });

  it('verifies a legacy-format hash and flags it for rehashing', async () => {
    const plain = 'legacy-user-password';
    const stored = makeHashedPassword(hash(plain, legacySalt)) as HashedPassword;

    const match = await verifyPassword(plain, stored, legacySalt);
    expect(match.isMatch).to.be.true;
    expect(match.needsRehash).to.be.true;
  });

  it('does not flag a wrong password against a legacy hash for rehashing', async () => {
    const stored = makeHashedPassword(hash('legacy-user-password', legacySalt)) as HashedPassword;

    const result = await verifyPassword('wrong', stored, legacySalt);
    expect(result.isMatch).to.be.false;
    expect(result.needsRehash).to.be.false;
  });

  // A stored hash with out-of-range parameters (corruption, or an attacker who can write
  // account.json trying to force a huge scrypt allocation) must fail cleanly, not throw
  // or exhaust memory. makeHashedPassword accepts the shape; the parameter guard lives in
  // the parser used by verifyPassword, so it's constructed directly here.
  it('fails to match instead of throwing on out-of-range scrypt parameters', async () => {
    const salt = 'a'.repeat(32);
    const digest = 'b'.repeat(128);
    const hostileValues = [
      si`scrypt$v1$N=9999999999999999999999,r=8,p=1$${salt}$${digest}`, // overflows Number precision
      si`scrypt$v1$N=1073741824,r=8,p=1$${salt}$${digest}`, // 2^30 — would demand ~1 TiB
      si`scrypt$v1$N=16385,r=8,p=1$${salt}$${digest}`, // not a power of two
      si`scrypt$v1$N=0,r=8,p=1$${salt}$${digest}`, // zero
    ];

    for (const value of hostileValues) {
      const stored = makeHashedPassword(value) as HashedPassword;
      expect(isErr(makeHashedPassword(value)), value).to.be.false; // shape is accepted

      const result = await verifyPassword('any-password', stored, legacySalt);
      expect(result.isMatch, value).to.be.false;
      expect(result.needsRehash, value).to.be.false;
    }
  });
});
