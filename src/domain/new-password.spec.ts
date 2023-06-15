import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeNewPassword, maxPasswordLength, minPasswordLength } from './new-password';

describe(makeNewPassword.name, () => {
  const field = 'newPassword';
  const longEnoughPassword = '*'.repeat(minPasswordLength);

  it(si`rejects passwords shorter than ${minPasswordLength}`, () => {
    expect(makeNewPassword('short password')).to.deep.equal(makeErr('Too short', field));
  });

  it(si`rejects passwords longer than ${maxPasswordLength}`, () => {
    const unacceptablyLongPassword = '*'.repeat(maxPasswordLength) + ' some more';
    expect(makeNewPassword(unacceptablyLongPassword)).to.deep.equal(makeErr('Too long', field));
  });

  it('rejects passwords with leading/trailing spaces', () => {
    expect(makeNewPassword(si`  ${longEnoughPassword}`)).to.deep.equal(makeErr('Has leading spaces', field));
    expect(makeNewPassword(si`  ${longEnoughPassword}  `)).to.deep.equal(makeErr('Has leading spaces', field));
    expect(makeNewPassword('test  ')).to.deep.equal(makeErr('Has trailing spaces', field));
  });

  it('accepts passwords containing spaces inside', () => {
    const passwordWithSpacesInside = si`${longEnoughPassword} some spaces inside`;

    expect(makeNewPassword(passwordWithSpacesInside)).to.deep.equal({
      kind: 'NewPassword',
      value: passwordWithSpacesInside,
    });
  });

  it(si`accepts passwords of length ${minPasswordLength} and more`, () => {
    expect(makeNewPassword(longEnoughPassword)).to.deep.equal({
      kind: 'NewPassword',
      value: longEnoughPassword,
    });
  });
});
