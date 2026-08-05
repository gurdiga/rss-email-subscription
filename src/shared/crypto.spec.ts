import { expect } from 'chai';
import { hash, timingSafeEqualHex } from './crypto';

describe(timingSafeEqualHex.name, () => {
  it('returns true for equal hex digests', () => {
    const digest = hash('some-input', 'some-salt');

    expect(timingSafeEqualHex(digest, digest)).to.be.true;
  });

  it('returns false for different hex digests of equal length', () => {
    const a = hash('input-a', 'salt');
    const b = hash('input-b', 'salt');

    expect(timingSafeEqualHex(a, b)).to.be.false;
  });

  it('returns false for hex digests of different length instead of throwing', () => {
    expect(timingSafeEqualHex('a'.repeat(64), 'a'.repeat(32))).to.be.false;
  });
});
