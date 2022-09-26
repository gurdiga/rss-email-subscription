import { expect } from 'chai';
import { makePlanId } from '../api/create-account';
import { makeErr } from '../shared/lang';
import { makeNewPassword, maxPasswordLength, minPasswordLength } from './new-password';

describe(makeNewPassword.name, () => {
  it('returns an Err value if not one of the valid plan IDs', () => {
    const planId = 'all-inclusive';

    expect(makePlanId(planId)).to.deep.equal(makeErr(`Unknown plan ID: ${planId}`));
  });

  it('trims the input', () => {
    const planId = ' minimal \t\n';

    expect(makePlanId(planId)).to.deep.equal('minimal');
  });

  const longEnoughPassword = '*'.repeat(minPasswordLength);

  it(`rejects passwords shorter than ${minPasswordLength}`, () => {
    expect(makeNewPassword('short password')).to.deep.equal(makeErr('Too short'));
  });

  it(`rejects passwords longer than ${maxPasswordLength}`, () => {
    const unacceptablyLongPassword = '*'.repeat(maxPasswordLength) + ' some more';
    expect(makeNewPassword(unacceptablyLongPassword)).to.deep.equal(makeErr('Too long'));
  });

  it('rejects passwords with leading/trailing spaces', () => {
    expect(makeNewPassword(`  ${longEnoughPassword}`)).to.deep.equal(makeErr('Has leading spaces'));
    expect(makeNewPassword(`  ${longEnoughPassword}  `)).to.deep.equal(makeErr('Has leading spaces'));
    expect(makeNewPassword('test  ')).to.deep.equal(makeErr('Has trailing spaces'));
  });

  it(`accepts passwords containing spaces inside`, () => {
    const passwordWithSpacesInside = `${longEnoughPassword} some spaces inside`;

    expect(makeNewPassword(passwordWithSpacesInside)).to.deep.equal({
      kind: 'NewPassword',
      value: passwordWithSpacesInside,
    });
  });

  it(`accepts passwords of length ${minPasswordLength} and more`, () => {
    expect(makeNewPassword(longEnoughPassword)).to.deep.equal({
      kind: 'NewPassword',
      value: longEnoughPassword,
    });
  });
});
