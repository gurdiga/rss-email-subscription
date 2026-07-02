import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { ConfirmationSecret, makeConfirmationSecret } from './confirmation-secrets';

describe(makeConfirmationSecret.name, () => {
  const field = 'secret';

  it('returns a ConfirmationSecret value for a valid hex string of the required length', () => {
    const input = 'a'.repeat(64);

    expect(makeConfirmationSecret(input)).to.deep.equal(<ConfirmationSecret>{
      kind: 'ConfirmationSecret',
      value: input,
    });
  });

  it('returns an Err value if input is incorrect', () => {
    expect(makeConfirmationSecret(undefined as any)).to.deep.equal(makeErr('Empty input', field));
    expect(makeConfirmationSecret('')).to.deep.equal(makeErr('Empty input', field));
    expect(makeConfirmationSecret(42 as any)).to.deep.equal(makeErr('Input of invalid type: number', field));
    expect(makeConfirmationSecret('42x')).to.deep.equal(makeErr('Input of invalid length; expected 64', field));
  });

  it('rejects a value with non-hex characters, blocking path traversal via the storage key', () => {
    // Exactly 64 chars, so it clears the length gate; path.join would normalize it to
    // <dataDirRoot>/settings.json (the hashingSalt file) if it were accepted.
    const traversalPayload = 'a'.repeat(49) + '/../../settings';

    expect(traversalPayload).to.have.lengthOf(64);
    expect(makeConfirmationSecret(traversalPayload)).to.deep.equal(makeErr('Input contains invalid characters', field));
    expect(makeConfirmationSecret('X'.repeat(64))).to.deep.equal(makeErr('Input contains invalid characters', field));
  });
});
