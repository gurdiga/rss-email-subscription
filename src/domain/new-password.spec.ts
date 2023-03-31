import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeNewPassword, maxPasswordLength, minPasswordLength } from './new-password';

describe(makeNewPassword.name, () => {
  const longEnoughPassword = '*'.repeat(minPasswordLength);

  it(si`rejects passwords shorter than ${minPasswordLength}`, () => {
    expect(makeNewPassword('short password')).to.deep.equal(makeErr('Too short'));
  });

  it(si`rejects passwords longer than ${maxPasswordLength}`, () => {
    const unacceptablyLongPassword = '*'.repeat(maxPasswordLength) + ' some more';
    expect(makeNewPassword(unacceptablyLongPassword)).to.deep.equal(makeErr('Too long'));
  });

  it('rejects passwords with leading/trailing spaces', () => {
    expect(makeNewPassword(si`  ${longEnoughPassword}`)).to.deep.equal(makeErr('Has leading spaces'));
    expect(makeNewPassword(si`  ${longEnoughPassword}  `)).to.deep.equal(makeErr('Has leading spaces'));
    expect(makeNewPassword('test  ')).to.deep.equal(makeErr('Has trailing spaces'));
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
