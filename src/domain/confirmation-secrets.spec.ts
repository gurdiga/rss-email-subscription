import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makeConfirmationSecret } from './confirmation-secrets';

describe(makeConfirmationSecret.name, () => {
  const field = 'secret';

  it('returns a ConfirmationSecret value for a valid string input', () => {
    const input = 'x'.repeat(64);
    const result = makeConfirmationSecret(input);

    expect(result).to.deep.equal(makeConfirmationSecret(input));
  });

  it('returns an Err value if input is incorrect', () => {
    expect(makeConfirmationSecret(undefined as any)).to.deep.equal(makeErr('Empty input', field));
    expect(makeConfirmationSecret('')).to.deep.equal(makeErr('Empty input', field));
    expect(makeConfirmationSecret(42 as any)).to.deep.equal(makeErr('Input of invalid type: number', field));
    expect(makeConfirmationSecret('42x')).to.deep.equal(makeErr('Input of invalid length; expected 64', field));
  });
});
