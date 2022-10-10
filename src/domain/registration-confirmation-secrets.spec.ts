import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import {
  makeRegistrationConfirmationSecret,
  RegistrationConfirmationSecret,
} from './registration-confirmation-secrets';

describe(makeRegistrationConfirmationSecret.name, () => {
  it('returns a RegistrationConfirmationSecret value for a corresponding string input', () => {
    const input = 'x'.repeat(64);
    const result = makeRegistrationConfirmationSecret(input);

    expect(result).to.deep.equal(<RegistrationConfirmationSecret>{
      kind: 'RegistrationConfirmationSecret',
      value: input,
    });
  });

  it('returns an Err value if input is incorrect', () => {
    expect(makeRegistrationConfirmationSecret(undefined)).to.deep.equal(makeErr('Empty input'));
    expect(makeRegistrationConfirmationSecret('')).to.deep.equal(makeErr('Empty input'));
    expect(makeRegistrationConfirmationSecret(42)).to.deep.equal(makeErr('Input of invalid type: number'));
    expect(makeRegistrationConfirmationSecret('42x')).to.deep.equal(makeErr('Input of invalid length; expected 64'));
  });
});
