import { hasKind } from '../shared/lang';
import { makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { EmailAddress } from './email-address';

export const maxEmailAddressLength = 100;

export function makeEmailAddress(input: unknown): Result<EmailAddress> {
  if (!input) {
    return makeErr('Email is empty');
  }

  if (typeof input !== 'string') {
    return makeErr('Email must be a string');
  }

  const emailString = input;
  const email = emailString.trim().toLocaleLowerCase();

  if (!email) {
    return makeErr('Email is empty');
  }

  if (email.length > maxEmailAddressLength) {
    return makeErr(si`Email needs to have less than ${maxEmailAddressLength} characters`);
  }

  const err = makeErr(si`Email is syntactically incorrect: "${emailString}"`);

  const keyCharacters = ['.', '@'];
  const containsKeyCharacters = keyCharacters.every((c) => email.includes(c));

  if (!containsKeyCharacters) {
    return err;
  }

  const parts = email.split('@');
  const [localPart = '', domain = ''] = parts.map((s) => s.trim());
  const doesLocalPartLookReasonable = localPart.length > 0 && /^[a-z0-9-_]+((\+|\.)?[a-z0-9-_]+)*$/i.test(localPart);

  if (!doesLocalPartLookReasonable) {
    return err;
  }

  const domainLevels = domain.split(/\./).reverse();
  const doDomainPartsLookReasonable = /[a-z]{2,}/i.test(domainLevels[0]!) && domainLevels.every((l) => l.length >= 1);

  if (!doDomainPartsLookReasonable) {
    return err;
  }

  return {
    kind: 'EmailAddress',
    value: email,
  };
}

export function isEmailAddress(value: unknown): value is EmailAddress {
  return hasKind(value, 'EmailAddress');
}
