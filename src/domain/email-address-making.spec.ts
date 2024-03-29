import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeEmailAddress, maxEmailAddressLength } from './email-address-making';
import { EmailAddress } from './email-address';

const field = 'email';

describe(makeEmailAddress.name, () => {
  it('returns an EmailAddress value from the given string', () => {
    expect(makeEmailAddress('a@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'a@test.com',
    } as EmailAddress);
    expect(makeEmailAddress('no-23@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'no-23@test.com',
    } as EmailAddress);
    expect(makeEmailAddress('John.Doe@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'john.doe@test.com',
    } as EmailAddress);
    expect(makeEmailAddress('john_doe@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'john_doe@test.com',
    } as EmailAddress);
  });

  it('accepts “plus addressing”', () => {
    expect(makeEmailAddress('a+1@test.com')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'a+1@test.com',
    } as EmailAddress);
  });

  it('trims the whitespace', () => {
    expect(makeEmailAddress('  a@test.com  ')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'a@test.com',
    } as EmailAddress);
    expect(makeEmailAddress('	b@test.com\t\t')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'b@test.com',
    } as EmailAddress);
    expect(makeEmailAddress('\r\nc@test.com ')).to.deep.equal({
      kind: 'EmailAddress',
      value: 'c@test.com',
    } as EmailAddress);
  });

  it('returns an Err value when the email is longer than maxEmailLength', () => {
    const tooLongAnEmail = si`${'a'.repeat(maxEmailAddressLength)}@toolong.com`;

    expect(makeEmailAddress(tooLongAnEmail)).to.deep.equal(
      makeErr('Email needs to have less than 100 characters', field)
    );
  });

  it('returns an Err value when the email is invalid', () => {
    expect(makeEmailAddress('')).to.deep.equal(makeErr('Email is empty', field));
    expect(makeEmailAddress(' \r\n\t')).to.deep.equal(makeErr('Email is empty', field));
    expect(makeEmailAddress('@test.com')).to.deep.equal(
      makeErr('Email is syntactically incorrect: "@test.com"', field)
    );
    expect(makeEmailAddress('this is not ok@test.com')).to.deep.equal(
      makeErr('Email is syntactically incorrect: "this is not ok@test.com"', field)
    );
    expect(makeEmailAddress('a+@test.com')).to.deep.equal(
      makeErr('Email is syntactically incorrect: "a+@test.com"', field)
    );
    expect(makeEmailAddress('a++2@test.com')).to.deep.equal(
      makeErr('Email is syntactically incorrect: "a++2@test.com"', field)
    );
    expect(makeEmailAddress('++2@test.com')).to.deep.equal(
      makeErr('Email is syntactically incorrect: "++2@test.com"', field)
    );
    expect(makeEmailAddress('a@test')).to.deep.equal(makeErr('Email is syntactically incorrect: "a@test"', field));
    expect(makeEmailAddress('a@too-short-tld.i')).to.deep.equal(
      makeErr('Email is syntactically incorrect: "a@too-short-tld.i"', field)
    );
    expect(makeEmailAddress('a@bad.')).to.deep.equal(makeErr('Email is syntactically incorrect: "a@bad."', field));
    expect(makeEmailAddress(42)).to.deep.equal(makeErr('Email must be a string', field));
    expect(makeEmailAddress(undefined)).to.deep.equal(makeErr('Email is empty', field));
    expect(makeEmailAddress(null)).to.deep.equal(makeErr('Email is empty', field));
    expect(makeEmailAddress({})).to.deep.equal(makeErr('Email must be a string', field));
    expect(makeEmailAddress([])).to.deep.equal(makeErr('Email must be a string', field));
  });
});
